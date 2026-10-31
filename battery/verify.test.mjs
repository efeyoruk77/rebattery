import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestOne } from './ingest.mjs';
import { verify } from './verify.mjs';

const doc = ingestOne({
  doc_id: 'd1', pack_id: 'A', kind: 'service_invoice', language: 'de', filename: 'd1.txt',
  bytes: Buffer.from('Rechnung\n2. Modul 4   ersetzt (Grund:\nZellungleichgewicht)\fSeite zwei\n'),
});
const src = (over = {}) => ({ doc_id: 'd1', sha256: doc.sha256, page: 1, line: 2, quote: 'Modul 4 ersetzt', ...over });
const ev = (over = {}) => ({ event_id: 'A-e1', pack_id: 'A', module_ids: ['A-M4'], cell_ids: [], type: 'module_replacement', date: '2021-06-14',
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

test('rejects events whose module, cell, or source belongs to another pack', () => {
  assert.match(run([ev({ module_ids: ['A-M4', 'B-M4'] })]).rejected[0].reason, /module B-M4 is not in pack A/);
  assert.match(run([ev({ cell_ids: ['B-M4-C01'] })]).rejected[0].reason, /cell B-M4-C01 is not in pack A/);
  assert.match(run([ev({ pack_id: 'B', module_ids: [] })]).rejected[0].reason, /belongs to pack A/);
});

test('needs module_ids and cell_ids as lists of valid IDs', () => {
  assert.match(run([ev({ module_ids: undefined })]).rejected[0].reason, /module_ids must be a list/);
  assert.match(run([ev({ module_ids: 'A-M4' })]).rejected[0].reason, /module_ids must be a list/);
  assert.match(run([ev({ cell_ids: ['A-M4'] })]).rejected[0].reason, /cell_ids has an invalid ID/);
  assert.deepEqual(run([ev({ module_ids: [], cell_ids: ['A-M4-C02'] })]).rejected, []);
});

test('accepts partial dates when a document only states the year or month', () => {
  assert.deepEqual(run([ev({ date: '2021' }), ev({ event_id: 'A-e2', date: '2021-06' })]).rejected, []);
  assert.match(run([ev({ date: '2021-13' })]).rejected[0].reason, /invalid date/);
});

test('checks the quote of an estimated event that has one (an unclear reading)', () => {
  const unclear = (quote) => ev({ type: 'production', confidence: 'estimated', source: src({ quote }) });
  assert.deepEqual(run([unclear('Modul 4 ersetzt')]).rejected, []);
  assert.match(run([unclear('Modul 5 ersetzt')]).rejected[0].reason, /quote not found/);
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

// Named gap: model, serial number, and VIN sat on another line than the quote, so nothing checked them.
test('keeps identity fields found in the source document and removes invented ones as rejected claims', () => {
  const out = run([ev({ fields: { manufacturer: 'Zellungleichgewicht', vin: 'WVWZZZ1KZ0P000000', reason: 'x' } })]);
  assert.equal(out.events.length, 1, 'the event stays: its quote is verified');
  assert.deepEqual(out.events[0].fields, { manufacturer: 'Zellungleichgewicht', reason: 'x' });
  assert.deepEqual(out.rejected, [{ event_id: 'A-e1', field: 'vin', reason: 'vin "WVWZZZ1KZ0P000000" not found in d1' }]);
});
