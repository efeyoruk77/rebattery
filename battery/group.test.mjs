import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { screenModules, groupCells, group } from './group.mjs';
import { checkModuleTests, checkCellTests } from './tests.mjs';
import { signRecord } from './canonical.mjs';

const mod = (module_id, over = {}) =>
  ({ module_id, cell_model: 'X1', chemistry: 'NMC', capacity_ah: 58.5, internal_resistance_mohm: 1.43, ...over });
const modules = ['A-M1', 'A-M2', 'A-M3'].map((id) => mod(id));
const known = [{ event_id: 'A-e1', pack_id: 'A', module_ids: [], type: 'production', date: '2020-01-01' }];
const facility = { id: 'F1', name: 'Test Facility' };
const cell = (cell_id, capacity_ah = 58.5, internal_resistance_mohm = 0.85, over = {}) => ({
  cell_id, module_id: cell_id.replace(/-C\d+$/, ''), cell_model: 'X1', chemistry: 'NMC', nominal_capacity_ah: 66,
  capacity_ah, internal_resistance_mohm, tested_on: '2026-10-29', facility, ...over,
});
const cellsOf = (moduleId, n, capacity = 58.5) => Array.from({ length: n }, (_, i) => cell(`${moduleId}-C${i + 1}`, capacity));
const rules = { capacity_band_pct: 2, resistance_band_pct: 10, cells_per_ess: 4 };
const ids = (list) => list.map((x) => x.id ?? x.cell_id ?? x.module_id);
const reasonFor = (held, id) => held.find((h) => h.id === id)?.reason ?? '';

// ---- module screening ----

test('screening clears modules with a clean history', () => {
  const r = screenModules(modules, known, []);
  assert.deepEqual(ids(r.cleared), ['A-M1', 'A-M2', 'A-M3']);
  assert.deepEqual(r.held_back, []);
});

test('screening holds back a module named in an accident, or the whole pack when no module is named', () => {
  const crash = (module_ids) => ({ event_id: 'A-e9', pack_id: 'A', module_ids, type: 'accident', date: '2023-02-07' });
  assert.deepEqual(ids(screenModules(modules, [...known, crash(['A-M1'])], []).held_back), ['A-M1']);
  const r = screenModules(modules, [...known, crash([])], []);
  assert.deepEqual(ids(r.held_back), ['A-M1', 'A-M2', 'A-M3']);
  assert.match(reasonFor(r.held_back, 'A-M2'), /accident event A-e9.*not taken apart/);
});

test('screening holds back modules named by an open warning', () => {
  const repl = { event_id: 'A-e2', pack_id: 'A', module_ids: ['A-M2'], type: 'module_replacement', date: '2021-06-14' };
  const warning = { type: 'inconsistency', rule: 'soh_after_replacement', events: ['A-e2'], message: '' };
  const r = screenModules(modules, [...known, repl], [warning]);
  assert.deepEqual(ids(r.held_back), ['A-M2']);
  assert.match(reasonFor(r.held_back, 'A-M2'), /open warning soh_after_replacement/);
});

test('screening holds back modules with no traceable donor', () => {
  assert.match(reasonFor(screenModules([...modules, mod('Z-M1')], known, []).held_back, 'Z-M1'), /no traceable donor/);
});

// ---- cell grouping ----

test('builds ESS units of a fixed size and records rules, lineage, health and facility', () => {
  const { new_batteries, held_back } = groupCells([...cellsOf('A-M1', 4, 58.0), ...cellsOf('B-M1', 4, 58.4)], rules);
  assert.deepEqual(held_back, []);
  assert.equal(new_batteries.length, 2);
  const [b] = new_batteries;
  assert.equal(b.battery_id, 'ESS-1');
  assert.deepEqual(b.rules, rules);
  assert.deepEqual(b.cells[0], { cell_id: 'A-M1-C1', module_id: 'A-M1', donor_pack: 'A' });
  assert.equal(b.health.cell_count, 4);
  assert.equal(b.health.usable_capacity_ah, 58.0);
  assert.equal(b.health.soh_pct, 87.9);
  assert.deepEqual(b.second_life_facility, facility);
});

test('usable capacity and health follow the weakest cell in series', () => {
  const { new_batteries: [b] } = groupCells([cell('A-M1-C1', 58.0), cell('A-M1-C2', 58.4), cell('A-M1-C3', 58.6), cell('A-M1-C4', 59.0)], rules);
  assert.equal(b.health.usable_capacity_ah, 58.0);
  assert.equal(b.health.avg_cell_capacity_ah, 58.5);
});

test('never mixes cell models or chemistries', () => {
  const lfp = cellsOf('C-M1', 4).map((c) => ({ ...c, chemistry: 'LFP' }));
  const { new_batteries } = groupCells([...cellsOf('A-M1', 4), ...lfp], rules);
  assert.deepEqual(new_batteries.map((b) => b.chemistry).sort(), ['LFP', 'NMC']);
  for (const b of new_batteries) assert.equal(new Set(b.cells.map((c) => c.module_id)).size, 1);
});

test('holds back a cell outside the capacity band', () => {
  const { new_batteries, held_back } = groupCells([...cellsOf('A-M1', 4), cell('A-M2-C1', 52.4)], rules);
  assert.equal(new_batteries.length, 1);
  assert.match(reasonFor(held_back, 'A-M2-C1'), /capacity 52.4 Ah matches no neighbouring cell within ±2%/);
});

test('holds back a cell outside the resistance band', () => {
  const { new_batteries, held_back } = groupCells([cell('A-M2-C1', 58.5, 1.12), ...cellsOf('A-M1', 4)], rules);
  assert.equal(new_batteries.length, 1);
  assert.match(reasonFor(held_back, 'A-M2-C1'), /resistance 1.12 mΩ is .* above the median/);
});

test('holds back left-over cells that cannot fill a whole ESS', () => {
  const { new_batteries, held_back } = groupCells(cellsOf('A-M1', 6), rules);
  assert.equal(new_batteries.length, 1);
  assert.equal(held_back.length, 2);
  assert.match(held_back[0].reason, /left over: only 2 matching cells.*needs 4/);
});

test('group() only uses cells from modules cleared by screening', () => {
  const crash = { event_id: 'A-e9', pack_id: 'A', module_ids: ['A-M2'], type: 'accident', date: '2023-02-07' };
  const r = group(modules, [...cellsOf('A-M1', 4), ...cellsOf('A-M2', 4)], [...known, crash], [], rules);
  assert.equal(r.new_batteries.length, 1);
  assert.ok(r.new_batteries[0].cells.every((c) => c.module_id === 'A-M1'));
  assert.deepEqual(ids(r.held_back), ['A-M2']);
});

// ---- signed test results ----

const keys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) };
};

test('module tests need a valid signature and a known donor pack', () => {
  const { privateKey, publicKeyPem } = keys();
  const good = signRecord(mod('A-M1'), privateKey);
  const edited = { ...signRecord(mod('A-M2'), privateKey), capacity_ah: 60 };
  const stranger = signRecord(mod('Q-M1'), privateKey);
  const r = checkModuleTests([good, edited, stranger, mod('A-M3')], { publicKeyPem, packs: ['A'] });
  assert.deepEqual(ids(r.valid), ['A-M1']);
  assert.deepEqual(r.rejected.map((x) => x.reason), ['signature is invalid', 'pack Q is not a known donor pack', 'signature is invalid']);
});

test('cell tests need a valid signature, a cleared module, and cell IDs from that module', () => {
  const { privateKey, publicKeyPem } = keys();
  const batch = (module_id, cells, over = {}) => signRecord({
    module_id, cell_model: 'X1', chemistry: 'NMC', nominal_capacity_ah: 66, tested_on: '2026-10-29', facility,
    cells: cells.map((cell_id) => ({ cell_id, capacity_ah: 58.5, internal_resistance_mohm: 0.85 })), ...over,
  }, privateKey);
  const edited = batch('A-M2', ['A-M2-C1']);
  edited.cells[0].capacity_ah = 60;
  const r = checkCellTests([
    batch('A-M1', ['A-M1-C1', 'B-M9-C1']),
    edited,
    batch('A-M3', ['A-M3-C1'], { chemistry: 'LFP' }),
    batch('A-M4', ['A-M4-C1']),
  ], { publicKeyPem, clearedModules: [mod('A-M1'), mod('A-M2'), mod('A-M3')] });
  assert.deepEqual(r.valid.map((c) => c.cell_id), ['A-M1-C1']);
  assert.deepEqual(r.valid[0].facility, facility);
  assert.deepEqual(r.rejected.map((x) => `${x.id}: ${x.reason}`), [
    'B-M9-C1: cell_id must look like A-M1-C<number>',
    'A-M2: cell tests: signature is invalid',
    'A-M3: cell tests: cell model or chemistry differs from the module test',
    'A-M4: cell tests: module A-M4 was not cleared for disassembly',
  ]);
});
