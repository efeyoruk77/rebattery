// Local review screen for stage B: show a draft, then sign and publish it.
// Lists the demo draft plus every paid draft found in local job state.
import {createServer} from 'node:http';
import {existsSync,readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import QRCode from 'qrcode';
import {createStageB} from './stage-b.mjs';
import {createCardanoSteps} from './cardano-steps.mjs';
import {collectStatus} from './status.mjs';
import {passportView,chainReader,TX} from './passport.mjs';

// Member 3's Cardano steps are connected here, not in stage-b.mjs defaults, so tests never reach the real chain.
// Writes stay off until CARDANO_WRITES_ENABLED=true.
const cardano = createCardanoSteps();
const finalize = createStageB(cardano);
const DEMO = 'examples/demo-draft.json';
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const files = dir => existsSync(dir) ? readdirSync(dir).filter(f => /^[0-9a-f-]{36}\.json$/.test(f)) : [];

export function listDrafts(root = '.') {
 const drafts = [];
 if (existsSync(`${root}/${DEMO}`)) drafts.push({id: 'demo', label: 'Demo draft (invented data, not paid)', draftText: readFileSync(`${root}/${DEMO}`, 'utf8'), paid: null});
 // The last run of e2e.mjs: real model output on the demo files, not paid, so it cannot be signed.
 if (existsSync(`${root}/.local/e2e-draft.json`)) drafts.push({id: 'e2e', label: 'Local end-to-end test (real model, not paid)', draftText: readFileSync(`${root}/.local/e2e-draft.json`, 'utf8'), paid: null});
 // Masumi standard API jobs (agent-api.mjs).
 for (const f of files(`${root}/.local/standard-jobs`)) {
  const j = readJson(`${root}/.local/standard-jobs/${f}`);
  if (j?.status === 'completed' && j.result) drafts.push({id: `job-${j.id}`, label: `Masumi job ${j.id}`, draftText: j.result, paid: {nonce: j.nonce, resultHash: j.resultHash, blockchainIdentifier: j.payment?.blockchainIdentifier}});
 }
 // Sokosumi paid tasks (worker.mjs + paid-task.mjs).
 for (const f of files(`${root}/.local`)) {
  const p = readJson(`${root}/.local/${f}`)?.paid;
  if (p?.result && ['awaiting-withdrawal', 'settled'].includes(p.stage)) drafts.push({id: `task-${f.slice(0, -5)}`, label: `Sokosumi task ${f.slice(0, -5)}`, draftText: p.result, paid: {hashScheme: 'task', resultHash: p.resultHash, blockchainIdentifier: p.payment?.blockchainIdentifier}});
 }
 return drafts;
}

// QR codes for a signed draft: ESS id -> {txHash, url, svg}. Only real passport transactions get a code;
// a draft that was never signed, or a link that is not a Preprod transaction, gets none.
// The code opens Cardanoscan, or this server's passport page when PASSPORT_BASE_URL (an https address a phone can reach) is set.
const PASSPORT_URL = /^https:\/\/preprod\.cardanoscan\.io\/transaction\/[0-9a-f]{64}$/;
const passportBase = (base = process.env.PASSPORT_BASE_URL) => /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(base ?? '') ? base.replace(/\/+$/, '') : null;
// The unsigned demo draft shows the passports of Member 3's unpaid test run instead, marked as a test run.
const DEMO_PASSPORTS = 'examples/demo-passports.json';
function passportsFor(id, root) {
 const signed = readJson(`${root}/.local/signed/${id}.json`)?.passports;
 if (signed || id !== 'demo') return {passports: signed ?? {}, testRun: false};
 const recorded = readJson(`${root}/${DEMO_PASSPORTS}`)?.passports ?? {};
 return {passports: Object.fromEntries(Object.entries(recorded).map(([ess, txHash]) => [ess, {txHash, url: `https://preprod.cardanoscan.io/transaction/${txHash}`}])), testRun: true};
}
export async function passportQrs(id, root = '.', base = passportBase()) {
 const {passports, testRun} = passportsFor(id, root);
 const out = {};
 for (const [ess, p] of Object.entries(passports)) {
  if (!PASSPORT_URL.test(p?.url ?? '')) continue;
  const url = base ? `${base}/passport/${p.txHash}` : p.url;
  out[ess] = {txHash: p.txHash, url, explorer: p.url, testRun, svg: await QRCode.toString(url, {type: 'svg', margin: 1, errorCorrectionLevel: 'M'})};
 }
 return out;
}

// Passport views, read from the chain at most once per transaction every five minutes.
const signedFor = id => readJson(`.local/signed/${id}.json`)?.signedRecord ?? null;
const passportCache = new Map();
function cachedPassport(tx, read = chainReader()) {
 const hit = passportCache.get(tx);
 if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.view;
 const view = passportView(tx, read, listDrafts(), {signedFor});
 passportCache.set(tx, {at: Date.now(), view});
 view.catch(() => passportCache.delete(tx));
 return view;
}

// Sign writes on Cardano, so it accepts only the review page itself: a local Host (no DNS rebinding), a same-origin
// Origin when the browser sends one, and a JSON body (a cross-site form or text/plain POST cannot set that type).
export function fromThisScreen(req, port) {
 const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
 const origin = req.headers.origin;
 return hosts.includes(req.headers.host) && (origin === undefined || hosts.some(h => origin === `http://${h}`))
  && /^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '');
}

const respond = (res, status, data, type = 'application/json') => { res.writeHead(status, {'content-type': type}); res.end(type === 'application/json' ? JSON.stringify(data) : data); };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const port = Number(process.env.REVIEW_PORT || 21952);
 createServer(async (req, res) => {
  try {
   const url = new URL(req.url, 'http://127.0.0.1');
   if (req.method === 'GET' && url.pathname === '/') return respond(res, 200, readFileSync('review.html', 'utf8'), 'text/html; charset=utf-8');
   if (req.method === 'GET' && /^\/passport\/[0-9a-f]{64}$/.test(url.pathname)) return respond(res, 200, readFileSync('passport.html', 'utf8'), 'text/html; charset=utf-8');
   if (req.method === 'GET' && url.pathname === '/api/passport') {
    const tx = url.searchParams.get('tx') ?? '';
    if (!TX.test(tx)) return respond(res, 400, {error: 'tx must be a 64-character transaction hash'});
    try { return respond(res, 200, await cachedPassport(tx)); }
    catch (e) { return respond(res, /is not a passport entry|is not the/.test(e.message) ? 404 : 502, {error: e.message.slice(0, 300)}); }
   }
   if (req.method === 'GET' && url.pathname === '/status') return respond(res, 200, readFileSync('status.html', 'utf8'), 'text/html; charset=utf-8');
   if (req.method === 'GET' && url.pathname === '/api/status') return respond(res, 200, await collectStatus());
   if (req.method === 'GET' && url.pathname === '/api/drafts') return respond(res, 200, listDrafts().map(({id, label, paid}) => ({id, label, paid: Boolean(paid)})));
   if (req.method === 'GET' && url.pathname === '/api/draft') {
    const d = listDrafts().find(x => x.id === url.searchParams.get('id'));
    return d ? respond(res, 200, {id: d.id, paid: Boolean(d.paid), draft: JSON.parse(d.draftText), passports: await passportQrs(d.id)}) : respond(res, 404, {error: 'Draft not found'});
   }
   if (req.method === 'POST' && url.pathname === '/api/sign') {
    if (!fromThisScreen(req, port)) return respond(res, 403, {error: 'Signing is accepted only from the review screen on this machine, as JSON'});
    let body = ''; for await (const part of req) { body += part; if (body.length > 20000) return respond(res, 413, {error: 'Request too large'}); }
    let parsed; try { parsed = JSON.parse(body || '{}'); } catch { return respond(res, 400, {error: 'Request body must be JSON'}); }
    const {id, changes} = parsed ?? {};
    const d = listDrafts().find(x => x.id === id);
    if (!d) return respond(res, 404, {error: 'Draft not found'});
    if (!d.paid) return respond(res, 400, {error: 'Only a paid draft can be signed. The demo draft is for display.'});
    const out = await finalize({draftText: d.draftText, ...d.paid}, {changes: typeof changes === 'string' && changes.trim() ? changes.trim().slice(0, 2000) : 'none'});
    out.passports = cardano.passports(out.signedRecord); // ESS id -> {txHash, url}: what each QR code opens
    mkdirSync('.local/signed', {recursive: true, mode: 0o700});
    writeFileSync(`.local/signed/${id}.json`, JSON.stringify(out, null, 2), {mode: 0o600});
    return respond(res, 200, out);
   }
   respond(res, 404, {error: 'Route not found'});
  } catch (e) { respond(res, 500, {error: e.message.slice(0, 300)}); }
 }).listen(port, '127.0.0.1', () => console.log(`Review screen: http://127.0.0.1:${port}`));
}
