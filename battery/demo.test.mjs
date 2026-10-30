import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDemo } from './run-demo.mjs';
import { readManifestFiles, uploadDocuments, uploadModuleTests, loadJobInputs } from './ingest.mjs';

const demoDir = new URL('./demo/', import.meta.url).pathname;

test('demo: all sample events verify, the 91% warning appears, and grouping holds back B-M1, B-M2 and A-M4', () => {
  const r = runDemo({ today: '2026-10-30' });
  assert.equal(r.rejected.length, 0);
  assert.equal(r.rejected_module_tests.length, 0);
  assert.ok(r.warnings.some((w) => w.rule === 'soh_after_replacement' && w.message.includes('91%')));
  assert.equal(r.new_batteries.length, 1);
  const [b] = r.new_batteries;
  assert.equal(b.battery_id, 'NB-1');
  assert.equal(b.modules.length, 21);
  assert.deepEqual(b.held_back.map((h) => h.module_id), ['A-M4', 'B-M1', 'B-M2']);
  assert.deepEqual([...new Set(b.modules.map((m) => m.donor_pack))], ['A', 'B', 'C']);
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
    assert.equal(documents.length, 4);
    assert.match(documents[0].sha256, /^[0-9a-f]{64}$/);
    const job = { packs: ['A'], documents, module_tests };
    assert.equal(loadJobInputs(job, store).documents.length, 4);
    assert.throws(() => loadJobInputs({ ...job, packs: ['B'] }, store), /not in the job/);
    writeFileSync(join(store, documents[2].sha256), 'Modul 4 ersetzt und Kapazitaet 100 %');
    assert.throws(() => loadJobInputs(job, store), /hash mismatch/);
  } finally {
    rmSync(store, { recursive: true, force: true });
  }
});
