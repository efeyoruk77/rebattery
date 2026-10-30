// Uploads a batch of donor-pack files into the store that stage A reads, and prints the job input for the buyer.
// A batch folder has the layout of battery/demo/: manifest.json (documents), module-tests/, cell-tests/.
//   node upload.mjs [batchDir] [--out file]     default batchDir: battery/demo
// Then create the Sokosumi task with the job input as its description (see README).
import {readFileSync, readdirSync, existsSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readManifestFiles, uploadDocuments, uploadModuleTests, uploadCellTests} from './battery/ingest.mjs';
import {parseJobInput} from './job-input.mjs';
import {defaultConfig} from './draft.mjs';

const readRecords = dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : [];

// Returns the job input text. parseJobInput checks it before anything is handed to a buyer.
export function uploadBatch(batchDir, storeDir) {
 const files = readManifestFiles(join(batchDir, 'manifest.json'), batchDir);
 const text = JSON.stringify({
  packs: [...new Set(files.map(f => f.pack_id))],
  documents: uploadDocuments(files, storeDir),
  module_tests: uploadModuleTests(readRecords(join(batchDir, 'module-tests')), storeDir),
  cell_tests: uploadCellTests(readRecords(join(batchDir, 'cell-tests')), storeDir),
 });
 parseJobInput(text);
 return text;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const args = process.argv.slice(2);
 const outAt = args.indexOf('--out');
 const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
 const batchDir = resolve(args[0] || 'battery/demo');
 const {storeDir} = defaultConfig();
 const text = uploadBatch(batchDir, storeDir);
 const job = JSON.parse(text);
 if (out) writeFileSync(out, text);
 console.error(`Uploaded ${job.documents.length} documents, ${job.module_tests.length} module tests, ${job.cell_tests.length} cell test batches to ${storeDir}`);
 if (!out) console.log(text);
}
