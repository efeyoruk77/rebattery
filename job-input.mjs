// Job input: the buyer lists uploaded files by ID and SHA-256 instead of sending them.
// The Masumi input hash covers this text, so it fixes exactly which files were submitted.
// The lists are what battery/ingest.mjs upload functions return:
//   documents: uploadDocuments, module_tests: uploadModuleTests, cell_tests: uploadCellTests (one batch per module taken apart).
export const MAX_JOB_INPUT_CHARS = 32000;
const PACK = /^[A-Z0-9]{1,8}$/;
const DOC = /^[A-Za-z0-9._-]{1,64}$/;
const MODULE = /^([A-Z0-9]{1,8})-M[0-9]{1,3}$/;
const SHA = /^[0-9a-f]{64}$/;
const LIMITS = { packs: 10, documents: 100, module_tests: 200, cell_tests: 200 };

function onlyKeys(value, keys, where) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`${where} must be an object`);
 const extra = Object.keys(value).filter(k => !keys.includes(k));
 if (extra.length) throw Error(`${where} has unknown field ${extra[0]}`);
}
function list(value, max, where) {
 if (!Array.isArray(value) || value.length > max) throw Error(`${where} must be a list of at most ${max}`);
 return value;
}
function checkEntries(items, idKey, idPattern, where, check = () => {}) {
 const seen = new Set();
 for (const f of items) {
  onlyKeys(f, [idKey, 'sha256'], where);
  if (!idPattern.test(f[idKey] ?? '')) throw Error(`${where} ${idKey} is invalid`);
  if (!SHA.test(f.sha256 ?? '')) throw Error(`${where} ${f[idKey]} needs a lowercase SHA-256`);
  if (seen.has(f[idKey])) throw Error(`${where} repeats ${f[idKey]}`);
  seen.add(f[idKey]);
  check(f);
 }
}

// True when a task description is a job input (JSON with packs and documents), not a plain chat message.
export function looksLikeJobInput(text) {
 try { const j = JSON.parse(text); return Boolean(j && typeof j === 'object' && 'packs' in j && 'documents' in j); } catch { return false; }
}

export function parseJobInput(text) {
 if (typeof text !== 'string' || !text.trim() || text.length > MAX_JOB_INPUT_CHARS) throw Error(`Job input must contain 1 to ${MAX_JOB_INPUT_CHARS} characters`);
 let job;
 try { job = JSON.parse(text); } catch { throw Error('Job input must be JSON'); }
 onlyKeys(job, ['packs', 'documents', 'module_tests', 'cell_tests'], 'Job input');
 const packs = list(job.packs, LIMITS.packs, 'packs');
 if (!packs.length || packs.some(p => typeof p !== 'string' || !PACK.test(p))) throw Error('packs must list 1 or more pack IDs such as "A"');
 if (new Set(packs).size !== packs.length) throw Error('packs repeats an ID');

 // Each document's pack is stored with the upload; loadJobInputs checks it is listed in packs.
 const documents = list(job.documents, LIMITS.documents, 'documents');
 if (!documents.length) throw Error('documents must list at least one document');
 checkEntries(documents, 'doc_id', DOC, 'Document');

 const inListedPack = where => f => { if (!packs.includes(MODULE.exec(f.module_id)[1])) throw Error(`${where} ${f.module_id} belongs to an unlisted pack`); };
 const moduleTests = list(job.module_tests ?? [], LIMITS.module_tests, 'module_tests');
 checkEntries(moduleTests, 'module_id', MODULE, 'Module test', inListedPack('Module test'));
 const cellTests = list(job.cell_tests ?? [], LIMITS.cell_tests, 'cell_tests');
 checkEntries(cellTests, 'module_id', MODULE, 'Cell test batch', f => {
  inListedPack('Cell test batch')(f);
  if (!moduleTests.some(m => m.module_id === f.module_id)) throw Error(`Cell test batch ${f.module_id} has no module test`);
 });
 return { packs, documents, module_tests: moduleTests, cell_tests: cellTests };
}
