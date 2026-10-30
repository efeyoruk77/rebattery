import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDemo } from './run-demo.mjs';
import { readManifestFiles, uploadDocuments, uploadModuleTests, uploadCellTests, loadJobInputs } from './ingest.mjs';

// fileURLToPath, not URL.pathname: on Windows pathname gives "/C:/..." and the paths break.
const demoDir = fileURLToPath(new URL('./demo/', import.meta.url));

test('demo: events verify, the 91% warning appears, A-M4, B-M1, B-M2 are not taken apart, and cells form ESS units', () => {
  const r = runDemo({ today: '2026-10-30' });
  assert.equal(r.rejected.length, 0);
  assert.equal(r.rejected_tests.length, 0);
  assert.ok(r.warnings.some((w) => w.rule === 'soh_after_replacement' && w.message.includes('91%')));
  assert.deepEqual(r.held_back.filter((h) => h.level === 'module').map((h) => h.id), ['A-M4', 'B-M1', 'B-M2']);
  assert.equal(r.new_batteries.length, 5);
  for (const b of r.new_batteries) {
    assert.equal(b.cells.length, 48);
    assert.deepEqual(b.donor_packs, ['A', 'B', 'C']);
    assert.equal(b.second_life_facility.id, 'DSL-AUG-01');
    assert.ok(b.health.soh_pct > 80 && b.health.soh_pct < 95);
  }
  const used = new Set(r.new_batteries.flatMap((b) => b.cells.map((c) => c.module_id)));
  for (const id of ['A-M4', 'B-M1', 'B-M2']) assert.ok(!used.has(id));
  const cellHolds = r.held_back.filter((h) => h.level === 'cell').map((h) => h.id);
  assert.ok(cellHolds.includes('A-M2-C11') && cellHolds.includes('C-M3-C05'));
});

test('demo bonus scene: the tampered "documented" claim is rejected', () => {
  const r = runDemo({ tampered: true, today: '2026-10-30' });
  assert.deepEqual(r.rejected.map((x) => x.event_id), ['A-x1']);
  assert.match(r.rejected[0].reason, /quote not found/);
});

test('upload returns IDs and hashes, and the job stops if a stored file changed', () => {
  const store = mkdtempSync(join(tmpdir(), 'battery-store-'));
  try {
    const files = readManifestFiles(join(demoDir, 'manifest.json'), demoDir).filter((f) => f.pack_id === 'A');
    const documents = uploadDocuments(files, store);
    const module_tests = uploadModuleTests([{ module_id: 'A-M1', capacity_ah: 58 }], store);
    const cell_tests = uploadCellTests([{ module_id: 'A-M1', cells: [{ cell_id: 'A-M1-C01' }] }], store);
    assert.equal(documents.length, 4);
    assert.match(documents[0].sha256, /^[0-9a-f]{64}$/);
    const job = { packs: ['A'], documents, module_tests, cell_tests };
    const loaded = loadJobInputs(job, store);
    assert.equal(loaded.documents.length, 4);
    assert.equal(loaded.cellTests[0].cells[0].cell_id, 'A-M1-C01');
    assert.throws(() => loadJobInputs({ ...job, packs: ['B'] }, store), /not in the job/);
    writeFileSync(join(store, documents[2].sha256), 'Modul 4 ersetzt und Kapazitaet 100 %');
    assert.throws(() => loadJobInputs(job, store), /hash mismatch/);
  } finally {
    rmSync(store, { recursive: true, force: true });
  }
});
