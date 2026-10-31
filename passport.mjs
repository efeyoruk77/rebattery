// The ESS passport page: follows one passport back through Cardano and shows the history behind it.
// The chain holds only fingerprints, so the history (events with their quotes, reasons, document names) comes from
// a draft on this machine, and only from a draft whose content matches what is on-chain.
import {LABEL,unchunk,packOf} from './cardano-log.mjs';
import {trace,checkContent,checkSignature} from './cardano-trace.mjs';

const BLOCKFROST = 'https://cardano-preprod.blockfrost.io/api/v0';
const KOIOS = 'https://preprod.koios.rest/api/v1/tx_metadata';
export const TX = /^[0-9a-f]{64}$/;

// Read-only: read(txHash) -> metadata under our label, or null. Blockfrost when a key is set, else the public Koios API.
// No wallet is needed to read.
export function chainReader({apiKey = process.env.BLOCKFROST_API_KEY_PREPROD, label = LABEL, fetchImpl = fetch} = {}) {
 const signal = () => AbortSignal.timeout(20000);
 if (apiKey) return async txHash => {
  const r = await fetchImpl(`${BLOCKFROST}/txs/${txHash}/metadata`, {headers: {project_id: apiKey}, signal: signal()});
  if (r.status === 404) return null;
  if (!r.ok) throw Error(`Blockfrost HTTP ${r.status}`);
  return (await r.json()).find(row => String(row.label) === String(label))?.json_metadata ?? null;
 };
 return async txHash => {
  const r = await fetchImpl(KOIOS, {method: 'POST', headers: {'content-type': 'application/json', accept: 'application/json'}, body: JSON.stringify({_tx_hashes: [txHash]}), signal: signal()});
  if (!r.ok) throw Error(`Koios HTTP ${r.status}. Set BLOCKFROST_API_KEY_PREPROD in .env to read through Blockfrost instead.`);
  return (await r.json())[0]?.metadata?.[String(label)] ?? null;
 };
}

const sourceOf = e => e.source ? {doc_id: e.source.doc_id, page: e.source.page, line: e.source.line, quote: e.source.quote} : null;

// passportView(passportTx, read, drafts, {signedFor}) -> everything the passport page shows.
// drafts: [{id, label, draftText}] as listDrafts returns them. signedFor(id) -> the signed record of that draft, if this machine has it.
export async function passportView(passportTx, read, drafts = [], {signedFor = () => null} = {}) {
 const traced = await trace(passportTx, read);
 const id = traced.passport.battery, battery = traced.battery;
 const assembled = battery.entries.find(e => e.type === 'assembled_from');
 const masumi = unchunk(battery.masumi);

 // Only a draft whose content matches the chain may supply the history.
 const match = drafts.find(d => { try { return !checkContent(traced, d.draftText).length; } catch { return false; } });
 const draft = match ? JSON.parse(match.draftText) : null;
 const signed = match ? signedFor(match.id) : null;
 const signatureProblems = signed ? checkSignature(traced, match.draftText, signed) : null;

 const donors = Object.entries(traced.donors).map(([name, d]) => {
  const pack = name.slice('pack:'.length);
  const disassembled = d.log.entries.find(e => e.type === 'disassembled') ?? {};
  const anchored = new Map(Object.entries(d.anchors).filter(([, a]) => a).flatMap(([tx, a]) =>
   ['docs', 'test', 'cells'].flatMap(g => Object.entries(a[g] ?? {}).map(([f, h]) => [`${g}:${f}`, {tx, sha256: h}]))));
  const reasons = new Map((draft?.held_back ?? []).map(h => [h.id, h.reason]));
  const view = {
   pack, logTx: d.tx,
   modules: Object.entries(d.modules).map(([module_id, cells]) => ({module_id, cells})),
   linkedBothWays: !d.unlinked.length,
   notTakenApart: (disassembled.not_taken_apart ?? []).map(m => ({id: m, reason: reasons.get(m) ?? null})),
   unusedCells: (disassembled.unused_cells ?? []).map(c => ({id: c, reason: reasons.get(c) ?? null})),
   anchorTxs: Object.keys(d.anchors),
  };
  if (!draft) return view;
  const events = draft.events.filter(e => e.pack_id === pack);
  return {...view,
   events: events.map(e => ({event_id: e.event_id, type: e.type, date: e.date, module_ids: e.module_ids, cell_ids: e.cell_ids, fields: e.fields, confidence: e.confidence, source: sourceOf(e)})),
   warnings: draft.warnings.filter(w => w.events.some(ev => packOf(ev) === pack)).map(w => ({rule: w.rule, message: w.message, events: w.events})),
   documents: draft.documents.filter(x => x.pack_id === pack).map(x => ({doc_id: x.doc_id, kind: x.kind, sha256: x.sha256, anchorTx: anchored.get(`docs:${x.doc_id}`)?.sha256 === x.sha256 ? anchored.get(`docs:${x.doc_id}`).tx : null})),
   testFiles: ['module_tests', 'cell_tests'].flatMap(k => (draft.test_files?.[k] ?? []).filter(t => packOf(t.module_id) === pack).map(t => {
    const key = `${k === 'module_tests' ? 'test' : 'cells'}:${t.module_id}`;
    return {kind: k === 'module_tests' ? 'module test' : 'cell test batch', module_id: t.module_id, sha256: t.sha256, anchorTx: anchored.get(key)?.sha256 === t.sha256 ? anchored.get(key).tx : null};
   })),
  };
 });

 const n = donors.length;
 const checks = [
  {ok: true, text: `Passport, ESS log and ${n} donor log${n === 1 ? '' : 's'} found on Cardano`},
  {ok: donors.every(d => d.linkedBothWays), text: donors.every(d => d.linkedBothWays) ? 'Every donor log sends its modules to this ESS (linked both ways)' : 'A donor log does not send its modules to this ESS'},
  match ? {ok: true, text: `Cells, health, events, held-back items and every file fingerprint match the draft "${match.label}"`}
   : {ok: false, text: 'No draft on this machine matches these records, so only the on-chain part is shown'},
  signatureProblems === null ? {ok: null, text: 'Company signature not checked: the signed record is not on this machine'}
   : {ok: !signatureProblems.length, text: signatureProblems.length ? `Company signature: ${signatureProblems.join('; ')}` : 'Company signature verifies, and every log carries it'},
 ];

 return {
  ess: {battery_id: id, passportTx, logTx: traced.passport.log_tx, health: traced.passport.health, facility: traced.passport.facility,
   cell_model: assembled.cell_model, chemistry: assembled.chemistry, count: assembled.count},
  payment: masumi === 'unpaid-test-run' ? {testRun: true} : {testRun: false, masumi, resultHash: unchunk(battery.paid)},
  draft: match ? {id: match.id, label: match.label} : null,
  checks, donors,
 };
}
