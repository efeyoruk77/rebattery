// AI extraction: Documents in, Events out, one pack at a time.
// The model is the clerk. Code repairs what code can check exactly (hashes, line numbers, IDs)
// and never adds facts. verify() still decides what is accepted.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkQuote } from './verify.mjs';

export const extractDefaults = {
  attempts: 3,          // model calls per pack before giving up
  timeoutMs: 180_000,   // a model call that takes longer counts as failed (a parked Eve session never answers)
  retryDelayMs: 5_000,  // wait between attempts; the free model is often briefly overloaded
  journalDir: '.local',
};

// The model is told to reply with one JSON object. Accept code fences or stray text around it.
export function parseModelJson(text) {
  if (typeof text !== 'string') throw Error('Model reply is not text');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw Error('Model reply has no JSON object');
  const out = JSON.parse(text.slice(start, end + 1));
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

  async function extractPack(packId, docs, deadline) {
    mkdirSync(o.journalDir, { recursive: true, mode: 0o700 });
    const input = JSON.stringify({ documents: docs });
    let lastError;
    for (let attempt = 1; attempt <= o.attempts; attempt++) {
      const left = deadline === undefined ? Infinity : deadline - Date.now();
      if (left <= 0) throw Error(`Deadline reached before extracting pack ${packId}${lastError ? ` (last error: ${lastError.message})` : ''}`);
      try {
        // A call never runs past the deadline: the paid draft must be delivered in time.
        const reply = await withTimeout(o.ask(input, join(o.journalDir, `extract-${packId}-session.json`)), Math.min(o.timeoutMs, left), `Model call for pack ${packId}`);
        return parseModelJson(reply);
      } catch (error) {
        lastError = error;
        o.log(`pack ${packId} attempt ${attempt} failed: ${error.message}`);
        if (attempt < o.attempts) await sleep(Math.min(o.retryDelayMs, Math.max(0, (deadline ?? Infinity) - Date.now())));
      }
    }
    throw Error(`Extraction for pack ${packId} failed after ${o.attempts} attempts: ${lastError.message}`);
  }

  // extractAll(documents, { deadline }) -> { packs: [{ pack_id, battery }], events, warnings }
  // warnings here are the model's hints (source "ai"); verify() makes the rule-based ones.
  async function extractAll(documents, { deadline = o.deadline } = {}) {
    const packIds = [...new Set(documents.map((d) => d.pack_id))].sort();
    const result = { packs: [], events: [], warnings: [] };
    for (const packId of packIds) {
      const docs = documents.filter((d) => d.pack_id === packId);
      const docsById = new Map(docs.map((d) => [d.doc_id, d]));
      const out = await extractPack(packId, docs, deadline);
      const events = out.events.map((e) => normalizeEvent(e, packId, docsById));
      const warnings = renumber(events, Array.isArray(out.warnings) ? out.warnings : [], packId);
      result.packs.push({ pack_id: packId, battery: out.battery ?? null });
      result.events.push(...events);
      result.warnings.push(...warnings.map((w) => ({ ...w, source: 'ai' })));
    }
    return result;
  }

  // extract(documents, { deadline }) -> events
  const extract = async (documents, options) => (await extractAll(documents, options)).events;
  return { extract, extractAll };
}
