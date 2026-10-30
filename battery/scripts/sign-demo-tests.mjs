// Writes the signed demo test results (invented values):
//   battery/demo/module-tests/<module>.json  - one per module, measured before disassembly
//   battery/demo/cell-tests/<module>.json    - one batch per module that was taken apart (12 cells each)
// The demo tester's private key is created once in .local/ (git-ignored); only the public key is committed.
// Run: node battery/scripts/sign-demo-tests.mjs
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { signRecord } from '../canonical.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const keyPath = `${root}.local/demo-tester-key.pem`;
const demo = `${root}battery/demo/`;

if (!existsSync(keyPath)) {
  mkdirSync(`${root}.local`, { recursive: true });
  const { privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
}
const privateKey = createPrivateKey(readFileSync(keyPath));
writeFileSync(`${demo}tester-public.pem`, createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }));

const CELL_MODEL = 'AC-NMC-66P';
const NOMINAL_AH = 66.0;
const CELLS_PER_MODULE = 12;
const facility = { id: 'DSL-AUG-01', name: 'Demo Second Life GmbH', site: 'Plant 1, Augsburg, DE', note: 'invented for the demo' };

// [capacity_ah, internal_resistance_mohm] per module 1..8.
// A-M4 is the 2021 replacement module (newer, so higher capacity and lower resistance).
// B-M1 and B-M2 sat next to the 2023 accident damage.
const packs = {
  A: [[58.4, 1.44], [58.9, 1.41], [57.8, 1.47], [64.9, 1.12], [58.2, 1.45], [59.0, 1.40], [58.6, 1.43], [57.9, 1.46]],
  B: [[52.1, 1.95], [53.0, 1.80], [59.1, 1.42], [58.7, 1.44], [58.0, 1.46], [59.3, 1.39], [58.5, 1.43], [58.8, 1.42]],
  C: [[58.3, 1.45], [59.2, 1.40], [57.6, 1.48], [58.9, 1.42], [58.1, 1.46], [58.7, 1.43], [59.0, 1.41], [58.4, 1.44]],
};
// Held back by their history, so never taken apart: no cell tests.
const notTakenApart = new Set(['A-M4', 'B-M1', 'B-M2']);
// Single cells that fail on their own, to show cell-level hold-backs.
const odd = { 'A-M2-C11': { capacity_ah: 52.4 }, 'C-M3-C05': { internal_resistance_mohm: 1.12 } };

// Fixed pseudo-random noise so the files are the same on every run.
let seed = 20261030;
const noise = (spread) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return (seed / 2 ** 31 - 0.5) * 2 * spread; };
const r = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

for (const dir of ['module-tests', 'cell-tests']) { rmSync(`${demo}${dir}`, { recursive: true, force: true }); mkdirSync(`${demo}${dir}`); }
const write = (path, record) => writeFileSync(path, `${JSON.stringify(signRecord(record, privateKey), null, 2)}\n`);

let batches = 0;
for (const [pack, modules] of Object.entries(packs)) {
  modules.forEach(([capacity, resistance], i) => {
    const module_id = `${pack}-M${i + 1}`;
    write(`${demo}module-tests/${module_id}.json`, {
      module_id, cell_model: CELL_MODEL, chemistry: 'NMC', capacity_ah: capacity, nominal_capacity_ah: NOMINAL_AH,
      internal_resistance_mohm: resistance, tested_on: '2026-10-28',
    });
    if (notTakenApart.has(module_id)) return;
    const cells = Array.from({ length: CELLS_PER_MODULE }, (_, c) => {
      const cell_id = `${module_id}-C${String(c + 1).padStart(2, '0')}`;
      return { cell_id, capacity_ah: r(capacity + noise(0.5), 2), internal_resistance_mohm: r(0.85 + noise(0.03), 3), ...odd[cell_id] };
    });
    write(`${demo}cell-tests/${module_id}.json`, {
      module_id, cell_model: CELL_MODEL, chemistry: 'NMC', nominal_capacity_ah: NOMINAL_AH, tested_on: '2026-10-29', facility, cells,
    });
    batches++;
  });
}
console.log(`Signed 24 module tests and ${batches} cell test batches (${batches * CELLS_PER_MODULE} cells).`);
