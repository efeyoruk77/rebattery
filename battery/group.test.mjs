import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { group } from './group.mjs';
import { checkModuleTests } from './module-tests.mjs';
import { signModuleTest } from './canonical.mjs';

const rules = { capacity_band_pct: 3, resistance_band_pct: 10, min_modules: 3 };
const mod = (module_id, capacity_ah = 58.5, internal_resistance_mohm = 1.43, over = {}) =>
  ({ module_id, cell_model: 'X1', chemistry: 'NMC', capacity_ah, internal_resistance_mohm, ...over });
const base = ['A-M1', 'A-M2', 'A-M3', 'A-M4'].map((id) => mod(id));
const known = [{ event_id: 'A-e1', pack_id: 'A', module_ids: [], type: 'production', date: '2020-01-01' }];
const ids = (list) => list.map((m) => m.module_id);
const heldReason = (battery, id) => battery.held_back.find((h) => h.module_id === id)?.reason ?? '';

test('builds one battery from matching modules and records its rule values', () => {
  const [b] = group(base, known, [], rules);
  assert.equal(b.battery_id, 'NB-1');
  assert.deepEqual(ids(b.modules), ['A-M1', 'A-M2', 'A-M3', 'A-M4']);
  assert.deepEqual(b.rules, rules);
  assert.equal(b.modules[0].donor_pack, 'A');
});

test('never mixes cell models or chemistries', () => {
  const batteries = group([...base, mod('A-M5', 58.5, 1.43, { chemistry: 'LFP' })], known, [], rules);
  assert.equal(batteries.length, 2);
  assert.deepEqual(ids(batteries.find((b) => b.chemistry === 'LFP').held_back), ['A-M5']);
});

test('holds back modules outside the capacity band', () => {
  const [b] = group([...base, mod('A-M5', 64.9)], known, [], rules);
  assert.match(heldReason(b, 'A-M5'), /capacity 64.9 Ah is .* above/);
});

test('holds back modules outside the resistance band', () => {
  const [b] = group([...base, mod('A-M5', 58.5, 1.8)], known, [], rules);
  assert.match(heldReason(b, 'A-M5'), /resistance 1.8 mΩ is .* above/);
});

test('holds back a module named in an accident, or the whole pack when no module is named', () => {
  const crash = (module_ids) => ({ event_id: 'A-e9', pack_id: 'A', module_ids, type: 'accident', date: '2023-02-07' });
  assert.deepEqual(ids(group([...base, mod('A-M5')], [...known, crash(['A-M1'])], [], rules)[0].held_back), ['A-M1']);
  assert.deepEqual(ids(group([...base, mod('A-M5'), mod('A-M6')], [...known, crash(['A-M1', 'A-M2'])], [], rules)[0].held_back), ['A-M1', 'A-M2']);
  const [b] = group(base, [...known, crash([])], [], rules);
  assert.equal(b.battery_id, null);
  assert.match(heldReason(b, 'A-M3'), /accident event A-e9/);
});

test('holds back modules named by an open warning', () => {
  const repl = { event_id: 'A-e2', pack_id: 'A', module_ids: ['A-M2'], type: 'module_replacement', date: '2021-06-14' };
  const warning = { type: 'inconsistency', rule: 'soh_after_replacement', events: ['A-e2'], message: '' };
  const [b] = group([...base, mod('A-M5')], [...known, repl], [warning], rules);
  assert.deepEqual(ids(b.held_back), ['A-M2']);
  assert.match(heldReason(b, 'A-M2'), /open warning soh_after_replacement/);
});

test('holds back modules with no traceable donor', () => {
  const [b] = group([...base, mod('Z-M1')], known, [], rules);
  assert.match(heldReason(b, 'Z-M1'), /no traceable donor/);
});

test('forms no battery when too few modules match', () => {
  const [b] = group(base.slice(0, 2), known, [], rules);
  assert.equal(b.battery_id, null);
  assert.equal(b.modules.length, 0);
  assert.match(heldReason(b, 'A-M1'), /at least 3/);
});

test('module tests need a valid signature and a known donor pack', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const good = signModuleTest(mod('A-M1'), privateKey);
  const edited = { ...signModuleTest(mod('A-M2'), privateKey), capacity_ah: 60 };
  const stranger = signModuleTest(mod('Q-M1'), privateKey);
  const r = checkModuleTests([good, edited, stranger, mod('A-M3')], { publicKeyPem, packs: ['A'] });
  assert.deepEqual(ids(r.valid), ['A-M1']);
  assert.deepEqual(r.rejected.map((x) => x.reason), ['signature is invalid', 'pack Q is not a known donor pack', 'signature is invalid']);
});
