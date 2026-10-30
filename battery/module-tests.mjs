// Checks signed module test results before grouping.
import { verifyModuleTestSignature } from './canonical.mjs';

const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

// checkModuleTests(tests, { publicKeyPem, packs }) -> { valid, rejected: [{ module_id, reason }] }
export function checkModuleTests(tests, { publicKeyPem, packs }) {
  const valid = [];
  const rejected = [];
  const seen = new Set();
  for (const test of tests) {
    const reason = (() => {
      const match = /^([A-Za-z0-9]+)-M(\d+)$/.exec(test.module_id ?? '');
      if (!match) return 'module_id must look like <pack>-M<number>';
      if (seen.has(test.module_id)) return 'duplicate module test';
      if (!packs.includes(match[1])) return `pack ${match[1]} is not a known donor pack`;
      if (!test.cell_model || !test.chemistry) return 'missing cell_model or chemistry';
      if (!positive(test.capacity_ah) || !positive(test.internal_resistance_mohm)) return 'capacity and resistance must be positive numbers';
      if (!verifyModuleTestSignature(test, publicKeyPem)) return 'signature is invalid';
      return null;
    })();
    seen.add(test.module_id);
    if (reason) rejected.push({ module_id: test.module_id ?? null, reason });
    else valid.push(test);
  }
  return { valid, rejected };
}
