import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExtractor, createExplainer, explainInput, parseModelJson, canonicalId } from './extract.mjs';
import { readFileSync } from 'node:fs';
import { screenModules, group } from './group.mjs';
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

test('writes module and cell IDs the way the test results do', () => {
  assert.deepEqual(['A-M4', 'A-M04', 'a-m4', ' A-M4 '].map(canonicalId), ['A-M4', 'A-M4', 'A-M4', 'A-M4']);
  assert.deepEqual(['A-M3-C7', 'A-M3-C07', 'a-m03-c7', 'A-M3-C123'].map(canonicalId), ['A-M3-C07', 'A-M3-C07', 'A-M3-C07', 'A-M3-C123']);
  assert.deepEqual(['M4', 'A-4', 'A-M4-X1', 7].map(canonicalId), ['M4', 'A-4', 'A-M4-X1', 7]);
});

test('a cell named as C7 is still held back as A-M1-C07', async () => {
  const cellEvent = replacement({ type: 'accident', module_ids: [], cell_ids: ['a-m1-c7', 'A-M1-C07'] });
  const { events } = await extractor(async () => reply([cellEvent])).extractAll(packA);
  assert.deepEqual(events[0].cell_ids, ['A-M1-C07']);
  const cell = (n) => ({ cell_id: `A-M1-C${String(n).padStart(2, '0')}`, module_id: 'A-M1', cell_model: 'X1', chemistry: 'NMC',
    nominal_capacity_ah: 66, capacity_ah: 58.5, internal_resistance_mohm: 0.85, tested_on: '2026-10-29', facility: { id: 'F1', name: 'F' } });
  const modules = [{ module_id: 'A-M1', cell_model: 'X1', chemistry: 'NMC', capacity_ah: 58.5, internal_resistance_mohm: 1.43 }];
  const r = group(modules, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(cell), events, [], { capacity_band_pct: 2, resistance_band_pct: 10, cells_per_ess: 4 },
    screenModules(modules, events, []));
  assert.ok(r.held_back.some((h) => h.id === 'A-M1-C07' && h.level === 'cell'));
  assert.ok(r.new_batteries.flatMap((b) => b.cells).every((c) => c.cell_id !== 'A-M1-C07'));
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

test('never calls the model past the deadline, and cuts a slow call off at the deadline', async () => {
  let calls = 0;
  await assert.rejects(extractor(async () => { calls++; return reply([]); }).extractAll(packA, { deadline: Date.now() - 1 }), /Deadline reached before extracting pack A/);
  assert.equal(calls, 0);
  const started = Date.now();
  await assert.rejects(extractor(() => new Promise(() => {}), { attempts: 1, timeoutMs: 60_000 }).extractAll(packA, { deadline: Date.now() + 100 }), /timed out after 0.1s|pack A failed/);
  assert.ok(Date.now() - started < 2000);
});

const badQuote = () => replacement({ source: { ...replacement().source, quote: 'Modul 9 ersetzt' } });

test('asks again when the verifier rejects events, and stops at the first clean reply', async () => {
  const replies = [reply([badQuote()]), reply([]), reply([replacement()])];
  let calls = 0;
  const log = [];
  const { events } = await extractor(async () => replies[calls++], { log: (m) => log.push(m) }).extractAll(packA);
  assert.equal(calls, 3);
  assert.equal(events[0].source.quote, 'Modul 4 ersetzt (Grund: Zellungleichgewicht)');
  assert.deepEqual(log, ['pack A attempt 1: 1 of 1 events rejected', 'pack A attempt 2: no events']);
});

test('keeps the reply with the most verified events when none is clean', async () => {
  const fault = replacement({ event_id: 'f', type: 'fault', source: { ...replacement().source, line: 10, quote: 'Spannungsdifferenz in Modul 4, Zellungleichgewicht' } });
  const replies = [reply([replacement(), badQuote()]), reply([replacement(), fault, badQuote()]), reply([badQuote()])];
  let calls = 0;
  const { events } = await extractor(async () => replies[calls++]).extractAll(packA);
  assert.equal(calls, 3);
  assert.deepEqual(events.map((e) => e.type), ['module_replacement', 'fault', 'module_replacement']);
});

test('at the deadline, uses the best reply so far instead of failing', async () => {
  let calls = 0;
  const ask = async () => { calls++; await new Promise((r) => setTimeout(r, 60)); return reply([replacement(), badQuote()]); };
  const { events } = await extractor(ask).extractAll(packA, { deadline: Date.now() + 100 });
  assert.equal(events.length, 2);
  assert.ok(calls <= 2);
});

test('sends each pack separately with only its own documents', async () => {
  const all = ingest(readManifestFiles(join(demoDir, 'manifest.json'), demoDir));
  const seen = [];
  await extractor(async (input) => { seen.push(JSON.parse(input).documents.map((d) => d.pack_id)); return reply([]); }, { attempts: 1 }).extractAll(all);
  assert.deepEqual(seen.map((packs) => [...new Set(packs)]), [['A'], ['B'], ['C']]);
});

// ---- grouping explanation ----
const demoDraft = JSON.parse(readFileSync(fileURLToPath(new URL('../examples/demo-draft.json', import.meta.url)), 'utf8'));
const grouping = { new_batteries: demoDraft.new_batteries, held_back: demoDraft.held_back, events: demoDraft.events, warnings: demoDraft.warnings };
const explainer = (ask, over = {}) => createExplainer({ ask, journalDir, retryDelayMs: 0, ...over });
const heldModule = demoDraft.held_back.find((h) => h.level === 'module').id;
const heldCell = demoDraft.held_back.find((h) => h.level === 'cell').id;

test('the explanation input fits the agent limit and lists cell counts, not 240 cell records', () => {
  const input = JSON.parse(explainInput(grouping));
  assert.equal(input.new_batteries[0].cell_count, 48);
  assert.equal('cells' in input.new_batteries[0], false);
  assert.ok(JSON.stringify(input).length < 15_000);
  assert.ok(input.events.every((e) => !('source' in e) && 'quote' in e));
});

test('keeps only explanations of ESS units, modules, and cells that are in the draft', async () => {
  const reply = JSON.stringify({
    ess: { 'ESS-1': 'ESS-1 has 48 cells.', 'ESS-99': 'invented' },
    modules: { [heldModule]: 'Not taken apart.', 'Z-M1': 'invented' },
    cells: [{ cell_ids: [heldCell, 'Z-M1-C01'], text: 'Left over.' }, { cell_ids: ['Z-M1-C02'], text: 'invented' }],
  });
  const out = await explainer(async () => '```json\n' + reply + '\n```')(grouping);
  assert.deepEqual(out, { ess: { 'ESS-1': 'ESS-1 has 48 cells.' }, modules: { [heldModule]: 'Not taken apart.' }, cells: [{ cell_ids: [heldCell], text: 'Left over.' }] });
});

test('the explanation never fails the draft: a broken reply, a hang, or a near deadline give null', async () => {
  let calls = 0;
  assert.equal(await explainer(async () => { calls++; return 'no json'; })(grouping), null);
  assert.equal(calls, 2);
  assert.equal(await explainer(() => new Promise(() => {}), { attempts: 1, timeoutMs: 50 })(grouping), null);
  calls = 0;
  assert.equal(await explainer(async () => { calls++; return '{}'; })(grouping, { deadline: Date.now() + 30_000 }), null);
  assert.equal(calls, 0, 'no call with less than a minute left');
});
