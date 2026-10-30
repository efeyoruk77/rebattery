// Checks signed module and cell test results before screening and grouping.
import { verifySignature } from './canonical.mjs';

const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

// checkModuleTests(tests, { publicKeyPem, packs }) -> { valid, rejected: [{ id, level, reason }] }
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
      if (!verifySignature(test, publicKeyPem)) return 'signature is invalid';
      return null;
    })();
    seen.add(test.module_id);
    if (reason) rejected.push({ id: test.module_id ?? null, level: 'module', reason });
    else valid.push(test);
  }
  return { valid, rejected };
}

// A cell test batch covers every cell of one disassembled module and is signed as a whole:
// { module_id, cell_model, chemistry, nominal_capacity_ah, tested_on, facility, cells: [{ cell_id, capacity_ah, internal_resistance_mohm }], signature }
// checkCellTests(batches, { publicKeyPem, clearedModules }) -> { valid: flat cell list, rejected }
// clearedModules: the module tests that passed screening (only those modules may be taken apart).
export function checkCellTests(batches, { publicKeyPem, clearedModules }) {
  const modules = new Map(clearedModules.map((m) => [m.module_id, m]));
  const valid = [];
  const rejected = [];
  const seenModules = new Set();
  const seenCells = new Set();
  for (const batch of batches) {
    const batchReason = (() => {
      if (seenModules.has(batch.module_id)) return 'duplicate cell test batch';
      const module = modules.get(batch.module_id);
      if (!module) return `module ${batch.module_id} was not cleared for disassembly`;
      if (batch.cell_model !== module.cell_model || batch.chemistry !== module.chemistry) return 'cell model or chemistry differs from the module test';
      if (!positive(batch.nominal_capacity_ah)) return 'nominal_capacity_ah must be a positive number';
      if (!batch.facility?.id || !batch.facility?.name) return 'missing facility id or name';
      if (!Array.isArray(batch.cells) || !batch.cells.length) return 'no cells';
      if (!verifySignature(batch, publicKeyPem)) return 'signature is invalid';
      return null;
    })();
    seenModules.add(batch.module_id);
    if (batchReason) { rejected.push({ id: batch.module_id ?? null, level: 'module', reason: `cell tests: ${batchReason}` }); continue; }

    for (const cell of batch.cells) {
      const reason = (() => {
        if (!(cell.cell_id ?? '').startsWith(`${batch.module_id}-C`)) return `cell_id must look like ${batch.module_id}-C<number>`;
        if (seenCells.has(cell.cell_id)) return 'duplicate cell';
        if (!positive(cell.capacity_ah) || !positive(cell.internal_resistance_mohm)) return 'capacity and resistance must be positive numbers';
        return null;
      })();
      seenCells.add(cell.cell_id);
      if (reason) { rejected.push({ id: cell.cell_id ?? null, level: 'cell', reason }); continue; }
      valid.push({
        ...cell,
        module_id: batch.module_id,
        cell_model: batch.cell_model,
        chemistry: batch.chemistry,
        nominal_capacity_ah: batch.nominal_capacity_ah,
        tested_on: batch.tested_on,
        facility: batch.facility,
      });
    }
  }
  return { valid, rejected };
}
