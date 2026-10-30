// Stage A: the paid draft. Runs inside the Masumi result deadline, with no human step.
// Member 1 plugs in these functions; see docs/team-plan.md.
import {writeFileSync} from 'node:fs';
import {parseJobInput} from './job-input.mjs';

const notConnected = (step, owner) => async () => { throw Error(`Draft step "${step}" is not connected yet (owner: ${owner})`); };
export const defaultSteps = {
 ingest: notConnected('ingest', 'Member 1'),   // (job) -> {documents, cellTestFiles, cellTests}
 extract: notConnected('extract', 'Member 1'), // (documents) -> events
 verify: notConnected('verify', 'Member 1'),   // (documents, events) -> {events, rejected, warnings}
 group: notConnected('group', 'Member 1'),     // (cellTests, events, warnings) -> newBatteries
};

// The buyer paid for exactly the listed files. Stop if any stored file differs.
function matchListed(listed, stored, idKey, what) {
 for (const l of listed) {
  const s = stored.find(x => x[idKey] === l[idKey]);
  if (!s || s.sha256 !== l.sha256 || s.pack_id !== l.pack_id) throw Error(`${what} ${l[idKey]} is missing or does not match its listed hash`);
 }
}

export function createDraftBuilder(steps = {}) {
 const s = {...defaultSteps, ...steps};
 // Same signature as client.mjs answer(), so the paid task adapter can call either.
 return async function buildDraft(input, journal, deadline) {
  const job = parseJobInput(input);
  const step = async (name, ...args) => {
   if (deadline !== undefined && Date.now() >= deadline) throw Error(`Result deadline expired before ${name}`);
   if (journal) writeFileSync(journal, JSON.stringify({phase: name}), {mode: 0o600});
   return s[name](...args);
  };
  const {documents, cellTestFiles = [], cellTests = []} = await step('ingest', job);
  matchListed(job.documents, documents, 'doc_id', 'Document');
  matchListed(job.cell_test_files, cellTestFiles, 'file_id', 'Cell test file');
  const extracted = await step('extract', documents);
  const {events, rejected, warnings} = await step('verify', documents, extracted);
  const newBatteries = await step('group', cellTests, events, warnings);
  const draft = {
   packs: job.packs,
   documents: documents.map(({doc_id, pack_id, kind, sha256, anchor_tx}) => ({doc_id, pack_id, kind, sha256, anchor_tx: anchor_tx ?? null})),
   events, rejected, warnings,
   cell_test_files: cellTestFiles.map(({file_id, pack_id, sha256}) => ({file_id, pack_id, sha256})),
   cell_tests: cellTests,
   new_batteries: newBatteries,
  };
  // The returned text is what gets hashed for Masumi, so build it in a fixed field order.
  return JSON.stringify(draft, null, 2);
 };
}

export const buildDraft = createDraftBuilder();
