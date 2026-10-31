// Upload and ingestion: files in, Documents (shared format) out.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { sha256 } from './canonical.mjs';

// Text files only for now. A form feed (\f) starts a new page. Pages and lines are numbered from 1,
// and blank lines count, so a line number matches what `cat -n` shows for a one-page file.
export function toPages(text) {
  return text.replace(/\r\n?/g, '\n').split('\f').map((pageText, i) => {
    const lines = pageText.split('\n');
    if (lines.at(-1) === '') lines.pop();
    return { page: i + 1, lines };
  });
}

const TEXT_TYPES = new Set(['.txt', '.md']);

// file: { doc_id, pack_id, kind, language, bytes, filename }
export function ingestOne(file) {
  for (const field of ['doc_id', 'pack_id', 'kind', 'language']) {
    if (typeof file[field] !== 'string' || !file[field]) throw new Error(`${file.doc_id ?? 'file'}: missing ${field}`);
  }
  if (!TEXT_TYPES.has(extname(file.filename ?? '').toLowerCase())) {
    throw new Error(`${file.doc_id}: only text files are supported; ship a reviewed text transcript for PDFs and photos`);
  }
  return {
    doc_id: file.doc_id,
    pack_id: file.pack_id,
    kind: file.kind,
    sha256: sha256(file.bytes),
    language: file.language,
    pages: toPages(Buffer.from(file.bytes).toString('utf8')),
  };
}

export const ingest = (files) => files.map(ingestOne);

// Reads a manifest ({ documents: [{ doc_id, pack_id, kind, language, path }] }) into ingest() input.
export function readManifestFiles(manifestPath, baseDir) {
  const { documents } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return documents.map(({ path, ...meta }) => ({ ...meta, filename: path, bytes: readFileSync(join(baseDir, path)) }));
}

// ---- Upload store (runs before the Masumi job) ----
// Files are stored by content hash; index.json maps each ID to its hash and metadata. Each upload is also kept
// under "<key>@<sha256>", so uploading a changed file with the same ID never breaks an earlier job input.

const indexPath = (storeDir) => join(storeDir, 'index.json');
const readIndex = (storeDir) => (existsSync(indexPath(storeDir)) ? JSON.parse(readFileSync(indexPath(storeDir), 'utf8')) : {});

// Stores documents and returns the job input's `documents` list: [{ doc_id, sha256 }].
export function uploadDocuments(files, storeDir) {
  mkdirSync(storeDir, { recursive: true });
  const index = readIndex(storeDir);
  const listed = files.map((file) => {
    const doc = ingestOne(file); // fail at upload time, not inside the paid job
    writeFileSync(join(storeDir, doc.sha256), file.bytes);
    const entry = { sha256: doc.sha256, pack_id: file.pack_id, kind: file.kind, language: file.language, filename: file.filename };
    index[`doc:${doc.doc_id}`] = entry;
    index[`doc:${doc.doc_id}@${doc.sha256}`] = entry;
    return { doc_id: doc.doc_id, sha256: doc.sha256 };
  });
  writeFileSync(indexPath(storeDir), JSON.stringify(index, null, 2));
  return listed;
}

// Stores signed JSON test records by content hash under `<prefix>:<module_id>`.
function uploadRecords(records, prefix, storeDir) {
  mkdirSync(storeDir, { recursive: true });
  const index = readIndex(storeDir);
  const listed = records.map((record) => {
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
    const hash = sha256(bytes);
    writeFileSync(join(storeDir, hash), bytes);
    index[`${prefix}:${record.module_id}`] = { sha256: hash };
    index[`${prefix}:${record.module_id}@${hash}`] = { sha256: hash };
    return { module_id: record.module_id, sha256: hash };
  });
  writeFileSync(indexPath(storeDir), JSON.stringify(index, null, 2));
  return listed;
}

// Returns the job input's `module_tests` list: [{ module_id, sha256 }].
export const uploadModuleTests = (tests, storeDir) => uploadRecords(tests, 'test', storeDir);
// Returns the job input's `cell_tests` list: [{ module_id, sha256 }], one batch per disassembled module.
export const uploadCellTests = (batches, storeDir) => uploadRecords(batches, 'cells', storeDir);

// Inside the job: load exactly the files the job input lists. Stops on any missing file or hash mismatch.
export function loadJobInputs(jobInput, storeDir) {
  const index = readIndex(storeDir);
  const read = (key, listedHash) => {
    const entry = index[`${key}@${listedHash}`] ?? index[key];
    if (!entry) throw new Error(`${key} was not uploaded`);
    const bytes = readFileSync(join(storeDir, entry.sha256));
    const actual = sha256(bytes);
    if (actual !== listedHash) throw new Error(`${key}: hash mismatch (job input ${listedHash}, stored file ${actual})`);
    return { entry, bytes };
  };
  const documents = jobInput.documents.map(({ doc_id, sha256: listed }) => {
    const { entry, bytes } = read(`doc:${doc_id}`, listed);
    return ingestOne({ doc_id, ...entry, bytes });
  });
  const readRecords = (list, prefix) => (list ?? []).map(({ module_id, sha256: listed }) =>
    JSON.parse(read(`${prefix}:${module_id}`, listed).bytes.toString('utf8')));
  const moduleTests = readRecords(jobInput.module_tests, 'test');
  const cellTests = readRecords(jobInput.cell_tests, 'cells');
  for (const doc of documents) {
    if (!jobInput.packs.includes(doc.pack_id)) throw new Error(`${doc.doc_id} belongs to pack ${doc.pack_id}, which is not in the job`);
  }
  return { documents, moduleTests, cellTests };
}
