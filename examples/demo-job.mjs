// Uploads the demo files in battery/demo/ into a store and returns the job input a buyer would send.
// Also regenerates examples/demo-draft.json:
//   node examples/demo-job.mjs                               uses the recorded explanation in examples/demo-explanation.json
//   node --env-file=.env examples/demo-job.mjs --explain     asks the live model again (needs npm start) and re-records it
// The recorded explanation is real model output (gemini-3.5-flash, Oct 31), checked fact by fact against the draft.
import {readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDraftBuilder} from '../draft.mjs';
import {uploadBatch} from '../upload.mjs';
import {createExplainer, parseExplanation} from '../battery/extract.mjs';

const recordedExplanation = fileURLToPath(new URL('./demo-explanation.json', import.meta.url));

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
  // The recorded explanation goes through the same parser as a live one, so IDs that are not in this draft are dropped.
  const live = process.argv.includes('--explain');
  const explain = live
   ? async grouping => { const out = await createExplainer({log: console.error})(grouping); if (out) writeFileSync(recordedExplanation, JSON.stringify(out, null, 2) + '\n'); return out; }
   : async grouping => existsSync(recordedExplanation) ? parseExplanation(readFileSync(recordedExplanation, 'utf8'), grouping) : null;
  const build = createDraftBuilder({extract, explain}, {storeDir: store, testerPublicKeyPath: demoTesterKeyPath});
  const draft = await build(prepareDemoJob(store));
  writeFileSync(fileURLToPath(new URL('./demo-draft.json', import.meta.url)), draft + '\n');
  const d = JSON.parse(draft);
  const e = d.explanation;
  console.log(`demo-draft.json: ${d.events.length} events, ${d.warnings.length} warnings, ${d.new_batteries.length} ESS units, ${d.held_back.length} held back, ` +
   (e ? `explanation for ${Object.keys(e.ess).length} ESS, ${Object.keys(e.modules).length} modules, ${e.cells.length} cell groups (${live ? 'live model' : 'recorded'})` : 'no explanation'));
 } finally { rmSync(store, {recursive: true, force: true}); }
}
