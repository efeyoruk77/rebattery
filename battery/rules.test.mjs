import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findInconsistencies } from './rules.mjs';

let n = 0;
const ev = (type, date, over = {}) => ({ event_id: `A-e${++n}`, pack_id: 'A', module_ids: [], cell_ids: [], type, date, fields: {}, ...over });
const rulesFired = (events) => findInconsistencies(events, { today: '2026-10-30' }).map((w) => w.rule);

test('flags a high health value soon after a module replacement', () => {
  const repl = ev('module_replacement', '2021-06-14', { module_ids: ['A-M4'] });
  const [w] = findInconsistencies([repl, ev('soh_measurement', '2022-09-20', { fields: { soh_pct: 91 } })], { today: '2026-10-30' });
  assert.equal(w.rule, 'soh_after_replacement');
  assert.match(w.message, /91%.*A-M4/);
  assert.deepEqual(rulesFired([repl, ev('soh_measurement', '2022-09-20', { fields: { soh_pct: 84 } })]), []);
  assert.deepEqual(rulesFired([repl, ev('soh_measurement', '2023-06-14', { fields: { soh_pct: 95 } })]), []);
});

test('flags dates out of order and dates in the future', () => {
  assert.deepEqual(rulesFired([ev('production', '2020-03-11'), ev('first_registration', '2019-12-01')]), ['dates_out_of_order']);
  assert.deepEqual(rulesFired([ev('fault', '2027-01-01')]), ['dates_out_of_order']);
});

test('flags health rising without a repair, but not after one', () => {
  const low = ev('soh_measurement', '2022-01-01', { fields: { soh_pct: 85 } });
  const high = ev('soh_measurement', '2023-01-01', { fields: { soh_pct: 92 } });
  assert.deepEqual(rulesFired([low, high]), ['health_rising_without_repair']);
  assert.deepEqual(rulesFired([low, ev('cell_replacement', '2022-06-01'), high]), []);
});

test('flags an accident with no later health measurement', () => {
  const crash = ev('accident', '2023-02-07', { module_ids: ['A-M1'] });
  assert.deepEqual(rulesFired([crash]), ['accident_without_inspection']);
  assert.deepEqual(rulesFired([crash, ev('soh_measurement', '2023-03-01', { fields: { soh_pct: 80 } })]), []);
});

test('compares partial dates only at the precision both have', () => {
  assert.deepEqual(rulesFired([ev('production', '2020-03-11'), ev('first_registration', '2020')]), []);
  assert.deepEqual(rulesFired([ev('production', '2020'), ev('first_registration', '2019-12')]), ['dates_out_of_order']);
});

test('checks each pack separately', () => {
  const repl = ev('module_replacement', '2021-06-14', { module_ids: ['A-M4'] });
  assert.deepEqual(rulesFired([repl, ev('soh_measurement', '2022-01-01', { pack_id: 'B', fields: { soh_pct: 95 } })]), []);
});
