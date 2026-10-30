import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestOne } from './ingest.mjs';
import { verify } from './verify.mjs';

const doc = ingestOne({
  doc_id: 'd1', pack_id: 'A', kind: 'service_invoice', language: 'de', filename: 'd1.txt',
  bytes: Buffer.from('Rechnung\n2. Modul 4   ersetzt (Grund:\nZellungleichgewicht)\fSeite zwei\n'),
});
const src = (over = {}) => ({ doc_id: 'd1', sha256: doc.sha256, page: 1, line: 2, quote: 'Modul 4 ersetzt', ...over });
const ev = (over = {}) => ({ event_id: 'A-e1', pack_id: 'A', module_id: 'A-M4', type: 'module_replacement', date: '2021-06-14',
  fields: {}, confidence: 'documented', source: src(), basis: [], ...over });
const run = (events) => verify([doc], events, { today: '2026-10-30' });

test('accepts a quote at its page and line, normalizing whitespace only', () => {
  assert.deepEqual(run([ev()]).rejected, []);
  assert.deepEqual(run([ev({ source: src({ quote: 'Modul  4\tersetzt' }) })]).rejected, []);
});

test('accepts a quote that runs onto the next lines', () => {
  assert.deepEqual(run([ev({ source: src({ quote: '(Grund: Zellungleichgewicht)' }) })]).rejected, []);
});

test('rejects quotes that are absent, on another line or page, or close but not exact', () => {
  for (const source of [
    src({ quote: 'Batteriekapazitaet auf 100 % wiederhergestellt' }),
    src({ line: 1 }),
    src({ page: 2, line: 1 }),
    src({ line: 9 }),
    src({ quote: 'Modul 4 ersetz t' }),
    src({ quote: 'modul 4 ersetzt' }),
  ]) {
    const r = run([ev({ source })]);
    assert.equal(r.events.length, 0, JSON.stringify(source));
    assert.equal(r.rejected.length, 1);
  }
});

test('rejects a quote whose document hash does not match', () => {
  assert.match(run([ev({ source: src({ sha256: '0'.repeat(64) }) })]).rejected[0].reason, /hash does not match/);
});

test('rejects documented or signed events without a quote', () => {
  for (const confidence of ['documented', 'signed']) {
    assert.match(run([ev({ confidence, source: src({ quote: '' }) })]).rejected[0].reason, /no quote/);
    assert.match(run([ev({ confidence, source: undefined })]).rejected[0].reason, /no source/);
  }
});

test('rejects events whose module or source belongs to another pack', () => {
  assert.match(run([ev({ module_id: 'B-M4' })]).rejected[0].reason, /not in pack A/);
  assert.match(run([ev({ pack_id: 'B', module_id: null })]).rejected[0].reason, /belongs to pack A/);
});

test('rejects estimated events whose basis is missing or rejected, and accepts chains of valid ones', () => {
  const est = (id, basis) => ev({ event_id: id, type: 'remaining_capacity_estimate', confidence: 'estimated', source: undefined, basis });
  const r = run([
    ev(),
    ev({ event_id: 'A-bad', source: src({ quote: 'not there' }) }),
    est('A-est1', ['A-e1']),
    est('A-est2', ['A-est1']),
    est('A-est3', ['A-bad']),
    est('A-est4', ['A-nope']),
    est('A-est5', []),
  ]);
  assert.deepEqual(r.events.map((e) => e.event_id), ['A-e1', 'A-est1', 'A-est2']);
  assert.deepEqual(r.rejected.map((x) => x.event_id).sort(), ['A-bad', 'A-est3', 'A-est4', 'A-est5']);
});

test('rejects duplicate IDs, unknown types and invalid dates', () => {
  const r = run([ev(), ev(), ev({ event_id: 'A-e2', type: 'repaint' }), ev({ event_id: 'A-e3', date: '14.06.2021' })]);
  assert.deepEqual(r.rejected.map((x) => x.reason), ['duplicate event_id', 'unknown type repaint', 'invalid date 14.06.2021']);
});
