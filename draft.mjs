// Stage A: the paid draft. Runs inside the Masumi result deadline, with no human step.
// Wires the job input to the code in battery/ (see battery/README.md).
import {readFileSync, writeFileSync} from 'node:fs';
import {parseJobInput} from './job-input.mjs';
import {loadJobInputs} from './battery/ingest.mjs';
import {createExtractor} from './battery/extract.mjs';
import {verify} from './battery/verify.mjs';
import {checkModuleTests, checkCellTests} from './battery/tests.mjs';
import {screenModules, group} from './battery/group.mjs';

// Where uploads are stored (battery/ingest.mjs upload functions), and the public key that signs test results.
// The demo tester key is the default; a real second-life company sets its own.
export const defaultConfig = () => ({
 storeDir: process.env.UPLOAD_STORE_DIR || '.local/uploads',
 testerPublicKeyPath: process.env.TESTER_PUBLIC_KEY_PATH || 'battery/demo/tester-public.pem',
});

export function connectedSteps({storeDir, testerPublicKeyPath} = defaultConfig()) {
 return {
  // (job) -> {documents, moduleTests, cellTests}. Stops on a missing file or a hash that differs from the job input.
  ingest: async job => loadJobInputs(job, storeDir),
  // (documents, {deadline}) -> events. AI extraction through the local Eve agent, one model call per pack.
  extract: async (documents, {deadline} = {}) => createExtractor({deadline}).extract(documents),
  // (documents, events) -> {events, rejected, warnings}
  verify: async (documents, events) => verify(documents, events),
  // Signed test checks, module screening, then cells into ESS units.
  group: async ({moduleTests, cellTests, events, warnings, packs}) => {
   const publicKeyPem = readFileSync(testerPublicKeyPath, 'utf8');
   const modules = checkModuleTests(moduleTests, {publicKeyPem, packs});
   const screened = screenModules(modules.valid, events, warnings);
   const cells = checkCellTests(cellTests, {publicKeyPem, clearedModules: screened.cleared});
   const grouped = group(modules.valid, cells.valid, events, warnings, undefined, screened);
   return {new_batteries: grouped.new_batteries, held_back: grouped.held_back, rejected_tests: [...modules.rejected, ...cells.rejected]};
  },
 };
}

export function createDraftBuilder(steps = {}, config) {
 const s = {...connectedSteps(config), ...steps};
 // Same signature as client.mjs answer(), so the paid task adapter can call either.
 return async function buildDraft(input, journal, deadline) {
  const job = parseJobInput(input);
  const step = async (name, ...args) => {
   if (deadline !== undefined && Date.now() >= deadline) throw Error(`Result deadline expired before ${name}`);
   if (journal) writeFileSync(journal, JSON.stringify({phase: name}), {mode: 0o600});
   return s[name](...args);
  };
  const {documents, moduleTests, cellTests} = await step('ingest', job);
  const extracted = await step('extract', documents, {deadline});
  const {events, rejected, warnings} = await step('verify', documents, extracted);
  const {new_batteries, held_back, rejected_tests} = await step('group', {moduleTests, cellTests, events, warnings, packs: job.packs});
  const draft = {
   packs: job.packs,
   documents: documents.map(({doc_id, pack_id, kind, sha256, anchor_tx}) => ({doc_id, pack_id, kind, sha256, anchor_tx: anchor_tx ?? null})),
   test_files: {module_tests: job.module_tests, cell_tests: job.cell_tests},
   events, rejected, warnings, rejected_tests,
   new_batteries, held_back,
  };
  // The returned text is what gets hashed for Masumi, so build it in a fixed field order.
  return JSON.stringify(draft, null, 2);
 };
}

export const buildDraft = createDraftBuilder();
