// Uploads the demo files in battery/demo/ into a store and returns the job input a buyer would send.
// Also regenerates examples/demo-draft.json: node examples/demo-job.mjs
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDraftBuilder} from '../draft.mjs';
import {uploadBatch} from '../upload.mjs';

const demo = fileURLToPath(new URL('../battery/demo/', import.meta.url));
export const demoTesterKeyPath = join(demo, 'tester-public.pem');

export const prepareDemoJob = storeDir => uploadBatch(demo, storeDir);

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
