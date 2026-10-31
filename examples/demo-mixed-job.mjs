// Regenerates examples/demo-mixed-draft.json from battery/demo-mixed/: the three NMC packs plus an LFP pack (D)
// and an NMC pack with another cell model (E). Shows on the review screen that cells of different chemistries
// or cell models are never combined into one ESS.  Run: node examples/demo-mixed-job.mjs
// No AI explanation is recorded for this set; the review screen says so.
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDraftBuilder} from '../draft.mjs';
import {uploadBatch} from '../upload.mjs';

const mixed = fileURLToPath(new URL('../battery/demo-mixed/', import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const store = mkdtempSync(join(tmpdir(), 'demo-mixed-store-'));
 try {
  const events = JSON.parse(readFileSync(join(mixed, 'sample-events.json'), 'utf8'));
  const tampered = JSON.parse(readFileSync(join(mixed, 'tampered-events.json'), 'utf8'));
  const build = createDraftBuilder({extract: async () => [...events, ...tampered], explain: async () => null},
   {storeDir: store, testerPublicKeyPath: join(mixed, 'tester-public.pem')});
  const draft = await build(uploadBatch(mixed, store));
  writeFileSync(fileURLToPath(new URL('./demo-mixed-draft.json', import.meta.url)), draft + '\n');
  const d = JSON.parse(draft);
  const families = [...new Set(d.new_batteries.map(b => `${b.cell_model} (${b.chemistry})`))];
  console.log(`demo-mixed-draft.json: ${d.packs.length} packs, ${d.events.length} events, ${d.warnings.length} warnings, ${d.new_batteries.length} ESS units in ${families.length} cell families [${families.join(', ')}], ${d.held_back.length} held back`);
 } finally { rmSync(store, {recursive: true, force: true}); }
}
