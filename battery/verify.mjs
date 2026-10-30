// Quote verification and confidence rules. Deterministic: no AI, no fuzzy matching.
import { eventTypes, confidenceLevels } from './config.mjs';
import { findInconsistencies } from './rules.mjs';

// Whitespace is the only thing normalized.
export const normalize = (text) => String(text).replace(/\s+/g, ' ').trim();

const MAX_QUOTE_LINES = 3; // a quote may run over at most this many lines, starting at source.line

// Returns null when the quote is found, otherwise the rejection reason.
export function checkQuote(source, docsById) {
  if (!source || typeof source !== 'object') return 'no source';
  const doc = docsById.get(source.doc_id);
  if (!doc) return `document ${source.doc_id} not found`;
  if (source.sha256 !== doc.sha256) return `hash does not match document ${doc.doc_id}`;
  const quote = normalize(source.quote ?? '');
  if (!quote) return 'no quote';
  const page = doc.pages.find((p) => p.page === source.page);
  if (!page) return `page ${source.page} not found in ${doc.doc_id}`;
  if (!Number.isInteger(source.line) || source.line < 1 || source.line > page.lines.length) {
    return `line ${source.line} not found on page ${source.page} of ${doc.doc_id}`;
  }
  // The quote must start on the stated line; it may continue onto the following lines.
  const firstLineLength = normalize(page.lines[source.line - 1]).length;
  const text = normalize(page.lines.slice(source.line - 1, source.line - 1 + MAX_QUOTE_LINES).join(' '));
  const at = text.indexOf(quote); // earliest match; any later one starts even further along
  if (at !== -1 && at < firstLineLength) return null;
  return `quote not found at ${doc.doc_id} page ${source.page} line ${source.line}`;
}

const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

// Shape checks that apply to every event, whatever its confidence.
function checkShape(event, docsById) {
  if (!event.event_id) return 'missing event_id';
  if (!eventTypes.includes(event.type)) return `unknown type ${event.type}`;
  if (!confidenceLevels.includes(event.confidence)) return `unknown confidence ${event.confidence}`;
  if (!isDate(event.date)) return `invalid date ${event.date}`;
  if (event.module_id != null && !event.module_id.startsWith(`${event.pack_id}-M`)) {
    return `module ${event.module_id} is not in pack ${event.pack_id}`;
  }
  if (event.confidence !== 'estimated') {
    const doc = docsById.get(event.source?.doc_id);
    if (doc && doc.pack_id !== event.pack_id) return `source ${doc.doc_id} belongs to pack ${doc.pack_id}, not ${event.pack_id}`;
  }
  return null;
}

// verify(documents, events) -> { events, rejected, warnings }
export function verify(documents, events, options = {}) {
  const docsById = new Map(documents.map((d) => [d.doc_id, d]));
  const accepted = new Map();
  const rejected = [];
  const reject = (event, reason) => rejected.push({ event_id: event.event_id ?? null, reason });
  const seen = new Set();
  const estimated = [];

  for (const event of events) {
    if (seen.has(event.event_id)) { reject(event, 'duplicate event_id'); continue; }
    seen.add(event.event_id);
    const reason = checkShape(event, docsById)
      ?? (event.confidence === 'estimated' ? null : checkQuote(event.source, docsById));
    if (reason) reject(event, reason);
    else if (event.confidence === 'estimated') estimated.push(event);
    else accepted.set(event.event_id, event);
  }

  // Estimated events stand only on accepted events. Resolve in rounds so an estimate can build on another estimate.
  let pending = estimated;
  for (;;) {
    const next = pending.filter((e) => !(Array.isArray(e.basis) && e.basis.length && e.basis.every((id) => accepted.has(id))));
    pending.filter((e) => !next.includes(e)).forEach((e) => accepted.set(e.event_id, e));
    if (next.length === pending.length) break;
    pending = next;
  }
  for (const event of pending) {
    const missing = (event.basis ?? []).filter((id) => !accepted.has(id));
    reject(event, missing.length ? `basis missing or rejected: ${missing.join(', ')}` : 'estimated event has no basis');
  }

  const kept = events.filter((e) => accepted.get(e.event_id) === e);
  return { events: kept, rejected, warnings: findInconsistencies(kept, options) };
}
