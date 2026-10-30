// Writes the signed demo module test results (invented values) to battery/demo/module-tests/.
// The demo tester's private key is created once in .local/ (git-ignored); only the public key is committed.
// Run: node battery/scripts/sign-demo-tests.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { signModuleTest } from '../canonical.mjs';

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

// [capacity_ah, internal_resistance_mohm] per module 1..8.
// A-M4 is the 2021 replacement module (newer, so higher capacity and lower resistance).
// B-M1 and B-M2 sat next to the 2023 accident damage.
const packs = {
  A: [[58.4, 1.44], [58.9, 1.41], [57.8, 1.47], [64.9, 1.12], [58.2, 1.45], [59.0, 1.40], [58.6, 1.43], [57.9, 1.46]],
  B: [[52.1, 1.95], [53.0, 1.80], [59.1, 1.42], [58.7, 1.44], [58.0, 1.46], [59.3, 1.39], [58.5, 1.43], [58.8, 1.42]],
  C: [[58.3, 1.45], [59.2, 1.40], [57.6, 1.48], [58.9, 1.42], [58.1, 1.46], [58.7, 1.43], [59.0, 1.41], [58.4, 1.44]],
};

mkdirSync(`${demo}module-tests`, { recursive: true });
for (const [pack, modules] of Object.entries(packs)) {
  modules.forEach(([capacity, resistance], i) => {
    const test = {
      module_id: `${pack}-M${i + 1}`,
      cell_model: 'AC-NMC-66P',
      chemistry: 'NMC',
      capacity_ah: capacity,
      nominal_capacity_ah: 66.0,
      internal_resistance_mohm: resistance,
      tested_on: '2026-10-28',
    };
    writeFileSync(`${demo}module-tests/${test.module_id}.json`, `${JSON.stringify(signModuleTest(test, privateKey), null, 2)}\n`);
  });
}
console.log('Signed 24 demo module tests.');
