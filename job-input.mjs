// Job input: the buyer lists uploaded files by ID and SHA-256 instead of sending them.
// The Masumi input hash covers this text, so it fixes exactly which files were submitted.
// Cell test results come as files (for example one CSV export per pack from the cell tester),
// because a pack has hundreds of cells and listing each one would not fit here.
export const MAX_JOB_INPUT_CHARS = 32000;
const PACK = /^[A-Z0-9]{1,8}$/;
const FILE = /^[A-Za-z0-9._-]{1,64}$/;
const SHA = /^[0-9a-f]{64}$/;
const LIMITS = { packs: 10, documents: 100, cell_test_files: 50 };

function onlyKeys(value, keys, where) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${where} must be an object`);
 const extra = Object.keys(value).filter(k => !keys.includes(k));
 if (extra.length) throw Error(`${where} has unknown field ${extra[0]}`);
}
function list(value, max, where) {
 if (!Array.isArray(value) || value.length > max) throw Error(`${where} must be a list of at most ${max}`);
 return value;
}
function checkFiles(items, idKey, packs, where) {
 const seen = new Set();
 for (const f of items) {
  onlyKeys(f, [idKey, 'pack_id', 'sha256'], where);
  if (!FILE.test(f[idKey] ?? '')) throw Error(`${where} ${idKey} is invalid`);
  if (!packs.includes(f.pack_id)) throw Error(`${where} ${f[idKey]} belongs to an unlisted pack`);
  if (!SHA.test(f.sha256 ?? '')) throw Error(`${where} ${f[idKey]} needs a lowercase SHA-256`);
  if (seen.has(f[idKey])) throw Error(`${where} repeats ${f[idKey]}`);
  seen.add(f[idKey]);
 }
}

export function parseJobInput(text) {
 if (typeof text !== 'string' || !text.trim() || text.length > MAX_JOB_INPUT_CHARS) throw Error(`Job input must contain 1 to ${MAX_JOB_INPUT_CHARS} characters`);
 let job;
 try { job = JSON.parse(text); } catch { throw Error('Job input must be JSON'); }
 onlyKeys(job, ['packs', 'documents', 'cell_test_files'], 'Job input');
 const packs = list(job.packs, LIMITS.packs, 'packs');
 if (!packs.length || packs.some(p => typeof p !== 'string' || !PACK.test(p))) throw Error('packs must list 1 or more pack IDs such as "A"');
 if (new Set(packs).size !== packs.length) throw Error('packs repeats an ID');

 const documents = list(job.documents, LIMITS.documents, 'documents');
 checkFiles(documents, 'doc_id', packs, 'Document');
 for (const p of packs) if (!documents.some(d => d.pack_id === p)) throw Error(`Pack ${p} has no documents`);

 const cellTestFiles = list(job.cell_test_files ?? [], LIMITS.cell_test_files, 'cell_test_files');
 checkFiles(cellTestFiles, 'file_id', packs, 'Cell test file');
 return { packs, documents, cell_test_files: cellTestFiles };
}

// Component IDs: pack "A", module "A-M4", cell "A-M4-C07".
export const CELL_ID = /^([A-Z0-9]{1,8})-M([0-9]{1,3})-C([0-9]{1,4})$/;
export const MODULE_ID = /^([A-Z0-9]{1,8})-M([0-9]{1,3})$/;
