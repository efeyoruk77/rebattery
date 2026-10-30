// Uploads the demo files in battery/demo/ into a store and returns the job input a buyer would send.
// Also regenerates examples/demo-draft.json: node examples/demo-job.mjs
import {readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readManifestFiles, uploadDocuments, uploadModuleTests, uploadCellTests} from '../battery/ingest.mjs';
import {createDraftBuilder} from '../draft.mjs';

const demo = fileURLToPath(new URL('../battery/demo/', import.meta.url));
const readDir = dir => readdirSync(join(demo, dir)).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(demo, dir, f), 'utf8')));
export const demoTesterKeyPath = join(demo, 'tester-public.pem');

export function prepareDemoJob(storeDir) {
 const files = readManifestFiles(join(demo, 'manifest.json'), demo);
 return JSON.stringify({
  packs: [...new Set(files.map(f => f.pack_id))],
  documents: uploadDocuments(files, storeDir),
  module_tests: uploadModuleTests(readDir('module-tests'), storeDir),
  cell_tests: uploadCellTests(readDir('cell-tests'), storeDir),
 });
}

// Mock extraction until Member 1's extract() is ready: the hand-made sample events.
export const sampleExtract = async () => JSON.parse(readFileSync(join(demo, 'sample-events.json'), 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const store = mkdtempSync(join(tmpdir(), 'demo-store-'));
 try {
  // The demo draft also carries the bonus scene's tampered claim, so the review screen shows a rejection.
  const tampered = JSON.parse(readFileSync(join(demo, 'tampered-events.json'), 'utf8'));
  const extract = async docs => [...await sampleExtract(docs), ...tampered];
  const build = createDraftBuilder({extract}, {storeDir: store, testerPublicKeyPath: demoTesterKeyPath});
  const draft = await build(prepareDemoJob(store));
  writeFileSync(fileURLToPath(new URL('./demo-draft.json', import.meta.url)), draft + '\n');
  const d = JSON.parse(draft);
  console.log(`demo-draft.json: ${d.events.length} events, ${d.warnings.length} warnings, ${d.new_batteries.length} ESS units, ${d.held_back.length} held back`);
 } finally { rmSync(store, {recursive: true, force: true}); }
}
