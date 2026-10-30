import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExtractor, parseModelJson } from './extract.mjs';
import { ingest, readManifestFiles } from './ingest.mjs';
import { verify } from './verify.mjs';

// fileURLToPath, not URL.pathname: on Windows pathname gives "/C:/..." and the paths break.
const demoDir = fileURLToPath(new URL('./demo/', import.meta.url));
const packA = ingest(readManifestFiles(join(demoDir, 'manifest.json'), demoDir)).filter((d) => d.pack_id === 'A');
const journalDir = mkdtempSync(join(tmpdir(), 'extract-test-'));
test.after(() => rmSync(journalDir, { recursive: true, force: true }));

const reply = (events, extra = {}) => JSON.stringify({ pack_id: 'A', battery: { chemistry: 'NMC' }, events, warnings: [], ...extra });
const replacement = (over = {}) => ({
  event_id: 'A-e1', pack_id: 'A', module_ids: ['A-M4'], cell_ids: [], type: 'module_replacement', date: '2021-06-14',
  fields: { reason: 'cell imbalance' }, confidence: 'documented',
  source: { doc_id: 'packA-invoice-2021-de', sha256: 'copied wrong', page: 1, line: 12, quote: 'Modul 4 ersetzt (Grund: Zellungleichgewicht)' },
  basis: [], ...over,
});
const extractor = (ask, over = {}) => createExtractor({ ask, journalDir, retryDelayMs: 0, ...over });

test('repairs a miscounted line and a miscopied hash, then the event verifies', async () => {
  const { events } = await extractor(async () => reply([replacement()])).extractAll(packA);
  assert.equal(events[0].source.line, 13);
  assert.equal(events[0].source.sha256, packA.find((d) => d.doc_id === 'packA-invoice-2021-de').sha256);
  assert.deepEqual(verify(packA, events, { today: '2026-10-30' }).rejected, []);
});

test('never invents a source: a quote that is not in the document stays as given and is rejected', async () => {
  const fake = replacement({ source: { ...replacement().source, quote: 'Batteriekapazitaet auf 100 % wiederhergestellt' } });
  const { events } = await extractor(async () => reply([fake])).extractAll(packA);
  assert.equal(events[0].source.line, 12);
  assert.match(verify(packA, events, { today: '2026-10-30' }).rejected[0].reason, /quote not found/);
});

test('downgrades "signed" from the model and fills missing lists', async () => {
  const { events } = await extractor(async () => reply([replacement({ confidence: 'signed', module_ids: undefined, module_id: 'A-M4', cell_ids: undefined, basis: undefined })])).extractAll(packA);
  assert.equal(events[0].confidence, 'documented');
  assert.deepEqual([events[0].module_ids, events[0].cell_ids, events[0].basis], [['A-M4'], [], []]);
  assert.equal('module_id' in events[0], false);
});

test('renumbers events per pack and keeps basis and warning links', async () => {
  const est = { event_id: 'x9', type: 'remaining_capacity_estimate', date: '2022', confidence: 'estimated', source: null, basis: ['x1'], fields: {} };
  const out = await extractor(async () => reply([replacement({ event_id: 'x1' }), est], { warnings: [{ type: 'inconsistency', events: ['x1', 'x9'], message: 'm' }] })).extractAll(packA);
  assert.deepEqual(out.events.map((e) => e.event_id), ['A-e1', 'A-e2']);
  assert.deepEqual(out.events[1].basis, ['A-e1']);
  assert.deepEqual(out.warnings[0].events, ['A-e1', 'A-e2']);
  assert.equal(out.warnings[0].source, 'ai');
  assert.deepEqual(out.packs, [{ pack_id: 'A', battery: { chemistry: 'NMC' } }]);
});

test('accepts replies wrapped in code fences or text', () => {
  assert.equal(parseModelJson('Here you go:\n```json\n{"events": []}\n```').events.length, 0);
  assert.throws(() => parseModelJson('no json'), /no JSON object/);
  assert.throws(() => parseModelJson('{"battery": {}}'), /no events list/);
});

test('retries a failed, hanging, or broken model reply, then gives up with the last reason', async () => {
  const replies = [() => Promise.reject(Error('overloaded')), () => new Promise(() => {}), async () => '{broken', async () => reply([replacement()])];
  let calls = 0;
  const { events } = await extractor(() => replies[calls++](), { attempts: 4, timeoutMs: 50 }).extractAll(packA);
  assert.equal(calls, 4);
  assert.equal(events.length, 1);
  await assert.rejects(extractor(async () => 'nothing', { attempts: 2 }).extractAll(packA), /pack A failed after 2 attempts: Model reply has no JSON object/);
});

test('sends each pack separately with only its own documents', async () => {
  const all = ingest(readManifestFiles(join(demoDir, 'manifest.json'), demoDir));
  const seen = [];
  await extractor(async (input) => { seen.push(JSON.parse(input).documents.map((d) => d.pack_id)); return reply([]); }).extractAll(all);
  assert.deepEqual(seen.map((packs) => [...new Set(packs)]), [['A'], ['B'], ['C']]);
});
