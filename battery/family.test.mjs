// Cells of different chemistries or different cell models are never combined into one ESS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { groupCells, group, assertOneFamily, cellFamily } from './group.mjs';

const rules = { capacity_band_pct: 2, resistance_band_pct: 10, cells_per_ess: 4 };
const facility = { id: 'F1', name: 'Test Facility' };
// Every cell gets the same capacity and resistance on purpose: only the family may keep them apart.
const cell = (cell_id, over = {}) => ({
  cell_id, module_id: cell_id.replace(/-C\d+$/, ''), cell_model: 'X1', chemistry: 'NMC', nominal_capacity_ah: 66,
  capacity_ah: 58.5, internal_resistance_mohm: 0.85, tested_on: '2026-10-29', facility, ...over,
});
const cellsOf = (moduleId, n, over = {}) => Array.from({ length: n }, (_, i) => cell(`${moduleId}-C${i + 1}`, over));
const familiesOf = (b) => new Set(b.cells.map((c) => c.cell_id.split('-')[0]));

test('identical measurements, different chemistry: two separate ESS units, never one', () => {
  const { new_batteries, held_back } = groupCells([...cellsOf('A-M1', 4, { chemistry: 'NMC' }), ...cellsOf('D-M1', 4, { chemistry: 'LFP', cell_model: 'L1' })], rules);
  assert.equal(new_batteries.length, 2);
  assert.equal(held_back.length, 0);
  for (const b of new_batteries) assert.equal(familiesOf(b).size, 1, `${b.battery_id} mixes packs of different chemistry`);
  assert.deepEqual(new_batteries.map((b) => b.chemistry).sort(), ['LFP', 'NMC']);
});

test('same chemistry, different cell model: kept apart, and left-overs stay left over', () => {
  // 4 cells of X1 and only 3 of X2: the X2 cells may not top up the X1 unit even though every value matches.
  const { new_batteries, held_back } = groupCells([...cellsOf('A-M1', 4), ...cellsOf('E-M1', 3, { cell_model: 'X2' })], rules);
  assert.equal(new_batteries.length, 1);
  assert.equal(new_batteries[0].cell_model, 'X1');
  assert.deepEqual(held_back.map((h) => h.id), ['E-M1-C1', 'E-M1-C2', 'E-M1-C3']);
  assert.match(held_back[0].reason, /left over/);
});

test('same cell model from different packs is combined (the positive case)', () => {
  const { new_batteries } = groupCells([...cellsOf('A-M1', 2), ...cellsOf('H-M1', 2)], rules);
  assert.equal(new_batteries.length, 1);
  assert.deepEqual(new_batteries[0].donor_packs, ['A', 'H']);
});

test('a cell without a recorded model or chemistry belongs to no family and is never grouped', () => {
  const { new_batteries, held_back } = groupCells([...cellsOf('A-M1', 4), cell('A-M2-C1', { cell_model: undefined })], rules);
  assert.equal(new_batteries.length, 1);
  assert.equal(held_back.length, 1);
  assert.match(held_back[0].reason, /cannot be assigned to a cell family/);
  assert.equal(cellFamily({ cell_model: 'X1' }), null);
});

test('the final guard refuses a unit that mixes families', () => {
  assert.throws(() => assertOneFamily([cell('A-M1-C1'), cell('D-M1-C1', { chemistry: 'LFP' })], 'ESS-9'), /ESS-9 would mix cell families/);
  assert.throws(() => assertOneFamily([cell('A-M1-C1'), cell('E-M1-C1', { cell_model: 'X2' })]), /would mix cell families/);
  assert.doesNotThrow(() => assertOneFamily([cell('A-M1-C1'), cell('H-M1-C1')]));
});

test('group() checks every finished unit against the cells it holds', () => {
  const moduleTests = [{ module_id: 'A-M1', cell_model: 'X1', chemistry: 'NMC' }];
  const events = [{ event_id: 'A-e1', pack_id: 'A', type: 'production', date: '2020-01-01', module_ids: [], cell_ids: [] }];
  const r = group(moduleTests, cellsOf('A-M1', 4), events, [], rules);
  assert.equal(r.new_batteries.length, 1);
  assert.equal(r.new_batteries[0].cell_model, 'X1');
});

test('mixed demo draft: every ESS holds exactly one cell family, matching its signed module tests', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const draft = JSON.parse(readFileSync(`${root}examples/demo-mixed-draft.json`, 'utf8'));
  const dir = `${root}battery/demo-mixed/module-tests/`;
  const moduleFamily = new Map(readdirSync(dir).map((f) => { const t = JSON.parse(readFileSync(dir + f, 'utf8')); return [t.module_id, cellFamily(t)]; }));
  const familiesSeen = new Set();
  for (const b of draft.new_batteries) {
    const fams = new Set(b.cells.map((c) => moduleFamily.get(c.module_id)));
    assert.deepEqual([...fams], [cellFamily(b)], `${b.battery_id} claims ${cellFamily(b)} but holds ${[...fams]}`);
    familiesSeen.add(cellFamily(b));
  }
  assert.ok(familiesSeen.size >= 3, 'the mixed demo should show at least three cell families');
  assert.ok(familiesSeen.has('AC-NMC-66P|NMC') && familiesSeen.has('AC-NMC-78P|NMC'), 'two NMC models must appear as separate families');
});
