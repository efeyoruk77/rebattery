// Uploads a batch of donor-pack files into the store that stage A reads, and prints the job input for the buyer.
// A batch folder has the layout of battery/demo/: manifest.json (documents), module-tests/, cell-tests/.
//   node upload.mjs [batchDir] [--out file]     default batchDir: battery/demo
// Then create the Sokosumi task with the job input as its description (see README).
import {readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
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

// The review screen's upload: the files of one batch folder as the browser sends them ([{path, text}]).
// They are written to a temporary folder and stored exactly like `node upload.mjs <dir>`.
// Paths must stay inside the batch, and the manifest may only name files of this upload, so a manifest
// can never make the server read other files on this machine.
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
export function uploadFiles(files, storeDir) {
 if (!Array.isArray(files) || !files.length) throw Error('No files: choose a batch folder');
 if (files.length > 2000) throw Error('Too many files in one batch (at most 2000)');
 let paths = files.map(f => String(f?.path ?? '').replace(/\\/g, '/'));
 // A browser sends a chosen folder's files as "<folder>/...": drop that first part when manifest.json sits under it.
 const first = paths[0].split('/')[0];
 if (!paths.includes('manifest.json') && paths.every(p => p.startsWith(`${first}/`)) && paths.includes(`${first}/manifest.json`)) paths = paths.map(p => p.slice(first.length + 1));
 for (const p of paths) if (!p.split('/').every(seg => SEGMENT.test(seg))) throw Error(`File path not allowed: ${p}`);
 if (new Set(paths).size !== paths.length) throw Error('The same file path appears twice');
 const at = paths.indexOf('manifest.json');
 if (at < 0) throw Error('The batch needs a manifest.json at its top level (layout of battery/demo/)');
 let manifest;
 try { manifest = JSON.parse(files[at].text); } catch { throw Error('manifest.json is not valid JSON'); }
 const missing = (manifest?.documents ?? []).map(d => String(d?.path ?? '')).filter(p => !paths.includes(p));
 if (missing.length) throw Error(`manifest.json names files that are not in the upload: ${missing.slice(0, 5).join(', ')}`);
 const dir = mkdtempSync(join(tmpdir(), 'batch-'));
 try {
  paths.forEach((p, i) => { mkdirSync(dirname(join(dir, p)), {recursive: true}); writeFileSync(join(dir, p), String(files[i].text ?? '')); });
  return uploadBatch(dir, storeDir);
 } finally { rmSync(dir, {recursive: true, force: true}); }
}

// What the review screen shows after an upload.
export const uploadSummary = text => { const j = JSON.parse(text); return {jobInput: text, packs: j.packs, documents: j.documents.length, moduleTests: j.module_tests.length, cellTests: j.cell_tests.length}; };

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
