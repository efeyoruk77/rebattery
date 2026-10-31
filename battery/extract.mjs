// AI extraction: Documents in, Events out, one pack at a time.
// The model is the clerk. Code repairs what code can check exactly (hashes, line numbers, IDs)
// and never adds facts. verify() still decides what is accepted.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkQuote, verify } from './verify.mjs';

export const extractDefaults = {
  attempts: 3,          // model calls per pack: retries after a failed call, or after a reply with rejected events
  timeoutMs: 180_000,   // a model call that takes longer counts as failed (a parked Eve session never answers)
  retryDelayMs: 5_000,  // wait between attempts; the free model is often briefly overloaded
  journalDir: '.local',
};

// The model is told to reply with one JSON object. Accept code fences or stray text around it.
export function parseModelJson(text) {
  const out = parseObject(text);
  if (!Array.isArray(out.events)) throw Error('Model reply has no events list');
  return out;
}

// Models miscount lines. Keep the stated line when the quote starts there; otherwise move the source to
// the one line where the quote starts. A quote found on several lines stays as stated, so verify() rejects
// it unless the stated line is right: an ambiguous quote must not be pinned to a guessed line.
export function locateQuote(source, doc) {
  const docs = new Map([[doc.doc_id, doc]]);
  const startsAt = (page, line) => checkQuote({ ...source, sha256: doc.sha256, page, line }, docs) === null;
  if (startsAt(source.page, source.line)) return source;
  const hits = doc.pages.flatMap((p) => p.lines.map((_, i) => [p.page, i + 1])).filter(([p, l]) => startsAt(p, l));
  return hits.length === 1 ? { ...source, page: hits[0][0], line: hits[0][1] } : source;
}

// IDs in the form the test results use: module numbers unpadded (A-M4), cell numbers two digits (A-M3-C07).
// The model may write A-M04 or a-m3-c7; without this, a named cell would not match its test result and would not be held back.
// Anything that is not a module or cell ID is left as it is, so verify() rejects it.
export function canonicalId(id) {
  const m = typeof id === 'string' ? /^([A-Za-z0-9]+)-M(\d+)(?:-C(\d+))?$/i.exec(id.trim()) : null;
  if (!m) return id;
  const module = `${m[1].toUpperCase()}-M${Number(m[2])}`;
  return m[3] === undefined ? module : `${module}-C${String(Number(m[3])).padStart(2, '0')}`;
}
const canonicalIds = (ids) => [...new Set(ids.map(canonicalId))];

function normalizeEvent(event, packId, docsById) {
  const e = { ...event, pack_id: packId };
  e.module_ids = canonicalIds(Array.isArray(e.module_ids) ? e.module_ids : e.module_id ? [e.module_id] : []);
  delete e.module_id;
  e.cell_ids = canonicalIds(Array.isArray(e.cell_ids) ? e.cell_ids : []);
  e.basis = Array.isArray(e.basis) ? e.basis : [];
  e.fields = e.fields && typeof e.fields === 'object' ? e.fields : {};
  // Only code may mark an event signed, from a verified signature.
  if (e.confidence === 'signed') e.confidence = 'documented';
  const doc = docsById.get(e.source?.doc_id);
  if (doc) {
    // The document hash is copied from the document the quote names; the model is bad at copying 64 hex characters.
    const source = { ...e.source, sha256: doc.sha256, page: e.source.page ?? 1 };
    e.source = locateQuote(source, doc);
  }
  return e;
}

// Event IDs must be unique across packs and stable: "<pack>-e<n>" in the model's (chronological) order.
function renumber(events, warnings, packId) {
  const ids = new Map();
  events.forEach((e, i) => { if (!ids.has(e.event_id)) ids.set(e.event_id, `${packId}-e${i + 1}`); e.event_id = `${packId}-e${i + 1}`; });
  const map = (id) => ids.get(id) ?? id;
  for (const e of events) e.basis = e.basis.map(map);
  return warnings.map((w) => ({ ...w, events: (w.events ?? []).map(map) }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${what} timed out after ${ms / 1000}s`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function defaultAsk(input, journal) {
  const { answer } = await import('../client.mjs');
  return answer(input, journal);
}

// createExtractor({ ask, attempts, timeoutMs, retryDelayMs, journalDir, deadline, log })
// ask(input, journalPath) -> model reply text. Defaults to the local Eve agent, which uses agent/instructions.md.
export function createExtractor(options = {}) {
  const o = { ...extractDefaults, ask: defaultAsk, log: () => {}, ...options };

  // One reply, normalized and scored by verify(). Code only scores the model's answers; it adds nothing.
  function score(out, packId, docs, docsById) {
    const events = out.events.map((e) => normalizeEvent(e, packId, docsById));
    const warnings = renumber(events, Array.isArray(out.warnings) ? out.warnings : [], packId);
    const check = verify(docs, events);
    return { battery: out.battery ?? null, events, warnings, verified: check.events.length, rejected: check.rejected.length };
  }
  // More verified events wins; then fewer rejected ones.
  const better = (a, b) => !b || a.verified > b.verified || (a.verified === b.verified && a.rejected < b.rejected);

  // Asks again while the reply has rejected events (or none at all), and keeps the best reply.
  // At the deadline, the best reply so far is used instead of failing the paid job.
  async function extractPack(packId, docs, deadline) {
    mkdirSync(o.journalDir, { recursive: true, mode: 0o700 });
    const input = JSON.stringify({ documents: docs });
    const docsById = new Map(docs.map((d) => [d.doc_id, d]));
    let best;
    let lastError;
    for (let attempt = 1; attempt <= o.attempts; attempt++) {
      const left = deadline === undefined ? Infinity : deadline - Date.now();
      if (left <= 0) {
        if (best) return best;
        throw Error(`Deadline reached before extracting pack ${packId}${lastError ? ` (last error: ${lastError.message})` : ''}`);
      }
      try {
        // A call never runs past the deadline: the paid draft must be delivered in time.
        const reply = await withTimeout(o.ask(input, join(o.journalDir, `extract-${packId}-session.json`)), Math.min(o.timeoutMs, left), `Model call for pack ${packId}`);
        const result = score(parseModelJson(reply), packId, docs, docsById);
        if (better(result, best)) best = result;
        if (result.rejected === 0 && result.verified > 0) return result;
        lastError = Error(result.events.length ? `${result.rejected} of ${result.events.length} events rejected` : 'no events');
      } catch (error) {
        if (best && /timed out/.test(error.message) && deadline !== undefined && Date.now() >= deadline) return best;
        lastError = error;
      }
      o.log(`pack ${packId} attempt ${attempt}: ${lastError.message}`);
      if (attempt < o.attempts) await sleep(Math.min(o.retryDelayMs, Math.max(0, (deadline ?? Infinity) - Date.now())));
    }
    if (best) return best;
    throw Error(`Extraction for pack ${packId} failed after ${o.attempts} attempts: ${lastError.message}`);
  }

  // extractAll(documents, { deadline }) -> { packs: [{ pack_id, battery }], events, warnings }
  // warnings here are the model's hints (source "ai"); verify() makes the rule-based ones.
  async function extractAll(documents, { deadline = o.deadline } = {}) {
    const packIds = [...new Set(documents.map((d) => d.pack_id))].sort();
    const result = { packs: [], events: [], warnings: [] };
    for (const packId of packIds) {
      const docs = documents.filter((d) => d.pack_id === packId);
      const { battery, events, warnings } = await extractPack(packId, docs, deadline);
      result.packs.push({ pack_id: packId, battery });
      result.events.push(...events);
      result.warnings.push(...warnings.map((w) => ({ ...w, source: 'ai' })));
    }
    return result;
  }

  // extract(documents, { deadline }) -> events
  const extract = async (documents, options) => (await extractAll(documents, options)).events;
  return { extract, extractAll };
}

// ---- Grouping explanation: code decided the grouping, the model explains it in plain words. ----

const INPUT_LIMIT = 15_000; // client.mjs accepts at most 16000 characters

// The model gets each ESS with cell counts per donor pack instead of 48 cell records, and each event with its quote.
// If that is still too long, only the events a held-back reason names are kept.
export function explainInput({ new_batteries = [], held_back = [], events = [], warnings = [] }) {
  const ess = new_batteries.map(({ cells = [], ...b }) => ({ ...b, cell_count: cells.length,
    cells_per_donor_pack: cells.reduce((n, c) => (n[c.donor_pack] = (n[c.donor_pack] ?? 0) + 1, n), {}) }));
  const slim = (list) => list.map(({ source, basis, ...e }) => ({ ...e, quote: source?.quote ?? null }));
  const build = (evs) => JSON.stringify({ new_batteries: ess, held_back, events: slim(evs), warnings });
  let input = build(events);
  if (input.length > INPUT_LIMIT) {
    const named = held_back.map((h) => h.reason ?? '').join(' ');
    input = build(events.filter((e) => named.includes(e.event_id)));
  }
  return input.length > INPUT_LIMIT ? null : input;
}

// Keeps only text about ESS units, modules, and cells that really are in the draft, so the model cannot add or rename any.
export function parseExplanation(text, { new_batteries = [], held_back = [] }) {
  const out = parseObject(text);
  const essIds = new Set(new_batteries.map((b) => b.battery_id));
  const heldModules = new Set(held_back.filter((h) => h.level === 'module').map((h) => h.id));
  const heldCells = new Set(held_back.filter((h) => h.level === 'cell').map((h) => h.id));
  const clean = (t) => typeof t === 'string' && t.trim() ? t.trim().slice(0, 2000) : null;
  const pick = (obj, ids) => Object.fromEntries(Object.entries(obj && typeof obj === 'object' ? obj : {})
    .filter(([id, t]) => ids.has(id) && clean(t)).map(([id, t]) => [id, clean(t)]));
  const cells = (Array.isArray(out.cells) ? out.cells : []).map((g) => ({
    cell_ids: canonicalIds(Array.isArray(g?.cell_ids) ? g.cell_ids : []).filter((id) => heldCells.has(id)), text: clean(g?.text),
  })).filter((g) => g.cell_ids.length && g.text);
  const result = { ess: pick(out.ess, essIds), modules: pick(out.modules, heldModules), cells };
  if (!Object.keys(result.ess).length && !Object.keys(result.modules).length && !cells.length) throw Error('Explanation names no ESS, module, or cell of the draft');
  return result;
}

function parseObject(text) {
  if (typeof text !== 'string') throw Error('Model reply is not text');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Error('Model reply has no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

// createExplainer({ ask, attempts, timeoutMs, retryDelayMs, journalDir, marginMs, log })
// explain(grouping, { deadline }) -> { ess, modules, cells } or null. It never throws: the draft is still
// delivered without an explanation, and the model is not called when less than marginMs is left before the deadline.
export function createExplainer(options = {}) {
  const o = { ...extractDefaults, attempts: 2, timeoutMs: 120_000, marginMs: 60_000, ask: defaultAsk, log: () => {}, ...options };
  return async function explain(grouping, { deadline = o.deadline } = {}) {
    if (!grouping?.new_batteries?.length && !grouping?.held_back?.length) return null;
    const input = explainInput(grouping);
    if (!input) { o.log('explanation skipped: input too long'); return null; }
    mkdirSync(o.journalDir, { recursive: true, mode: 0o700 });
    for (let attempt = 1; attempt <= o.attempts; attempt++) {
      const left = deadline === undefined ? Infinity : deadline - Date.now() - o.marginMs;
      if (left <= 0) { o.log('explanation skipped: too close to the deadline'); return null; }
      try {
        const reply = await withTimeout(o.ask(input, join(o.journalDir, 'explain-session.json')), Math.min(o.timeoutMs, left), 'Explanation call');
        return parseExplanation(reply, grouping);
      } catch (error) {
        o.log(`explanation attempt ${attempt}: ${error.message}`);
        if (attempt < o.attempts) await sleep(o.retryDelayMs);
      }
    }
    return null;
  };
}
