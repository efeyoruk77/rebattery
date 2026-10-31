// End-to-end test of the local backend with the real model, no payment and no chain writes:
// upload -> stage A (AI extraction, verification, warnings, screening, ESS grouping, AI explanation) -> checks -> stage B checks.
// Needs the agent running (npm start) and the model settings in .env.
//   node --env-file=.env e2e.mjs
// Writes the draft to .local/e2e-draft.json; the review screen lists it as "Local end-to-end test".
import {mkdtempSync, rmSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {uploadBatch} from './upload.mjs';
import {createDraftBuilder} from './draft.mjs';
import {runDemo} from './battery/run-demo.mjs';
import {resultHash, sha256} from './standard-hash.mjs';
import {createStageB} from './stage-b.mjs';

export const E2E_DRAFT = '.local/e2e-draft.json';
const demo = fileURLToPath(new URL('./battery/demo/', import.meta.url));
const results = [];
const check = (name, ok, detail = '') => { results.push({name, ok}); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const seconds = t0 => Math.round((Date.now() - t0) / 1000);

// 1. Preflight
const eveUrl = process.env.EVE_URL || 'http://127.0.0.1:21949';
const eveUp = await fetch(eveUrl, {signal: AbortSignal.timeout(3000)}).then(() => true, () => false);
check('AI agent is running', eveUp, eveUp ? eveUrl : `start it with npm start (${eveUrl})`);
check('model is configured', Boolean(process.env.ZAI_MODEL && process.env.ZAI_BASE_URL && process.env.ZAI_API_KEY), process.env.ZAI_MODEL || 'set ZAI_* in .env');
if (!eveUp) process.exit(1);

const store = mkdtempSync(join(tmpdir(), 'e2e-store-'));
try {
 // 2. Upload, as a buyer would
 const jobText = uploadBatch(demo, store);
 const job = JSON.parse(jobText);
 check('upload produced a job input', job.documents.length === 10 && job.module_tests.length === 24 && job.cell_tests.length === 21,
  `${job.documents.length} documents, ${job.module_tests.length} module tests, ${job.cell_tests.length} cell test batches, ${jobText.length} characters`);

 // 3. Stage A with the real model, under a Masumi-like 20-minute result deadline
 const t0 = Date.now();
 const build = createDraftBuilder({}, {storeDir: store, testerPublicKeyPath: join(demo, 'tester-public.pem')});
 const draftText = await build(jobText, join(store, 'journal.json'), Date.now() + 20 * 60_000);
 const took = seconds(t0);
 writeFileSync(E2E_DRAFT, draftText, {mode: 0o600});
 const draft = JSON.parse(draftText);
 check('stage A finished inside the deadline', took < 20 * 60, `${took} s (Masumi allows 20 min)`);

 // 4. Compare with the reference result (hand-checked sample events through the same code)
 const ref = runDemo();
 const key = e => `${e.pack_id} ${e.type} ${e.date} [${(e.module_ids || []).join(',')}]`;
 const got = new Set(draft.events.map(key));
 const missing = ref.events.filter(e => !got.has(key(e))).map(key);
 check('AI extraction found every expected event', !missing.length, missing.length ? `missing: ${missing.join('; ')}` : `${draft.events.length} verified events`);
 check('no claims rejected (no tampered input in this run)', draft.rejected.length === 0, draft.rejected.map(r => `${r.event_id}: ${r.reason}`).join('; '));
 const rules = draft.warnings.map(w => w.rule).sort().join(',');
 check('the expected warnings were raised', rules === ref.warnings.map(w => w.rule).sort().join(','), rules);
 check('same ESS units as the reference', JSON.stringify(draft.new_batteries) === JSON.stringify(ref.new_batteries),
  draft.new_batteries.map(b => `${b.battery_id} ${b.health.soh_pct}%`).join(', '));
 check('same held-back modules and cells as the reference', JSON.stringify(draft.held_back) === JSON.stringify(ref.held_back),
  `${draft.held_back.filter(h => h.level === 'module').length} modules, ${draft.held_back.filter(h => h.level === 'cell').length} cells`);
 const x = draft.explanation;
 const heldModules = draft.held_back.filter(h => h.level === 'module').map(h => h.id);
 check('AI explanation covers every ESS and held-back module', Boolean(x) && draft.new_batteries.every(b => x.ess[b.battery_id]) && heldModules.every(m => x.modules[m]),
  x ? `${Object.keys(x.ess).length} ESS, ${Object.keys(x.modules).length} modules, ${x.cells.length} cell groups` : 'explanation is null (model failed or was too slow; the draft is still valid)');

 // 5. Stage B: the signed record must point at exactly this draft, and a changed draft is refused.
 // Cardano writes are stubbed here; real writes need Member 3's wallet and the team decision (open problem #5).
 const nonce = 'e2e0000000000000';
 const paid = {draftText, nonce, resultHash: resultHash(draftText, nonce), blockchainIdentifier: 'e2e-local-test'};
 let signedRecord;
 const stageB = createStageB({sign: async r => { signedRecord = r; return {signer_public_key: 'e2e', signature: 'e2e'}; }, writeDonorLogs: async () => [], writeNewBatteryLog: async () => []});
 await stageB(paid);
 check('stage B signs exactly the paid draft', signedRecord?.draft_hash === sha256(draftText) && signedRecord?.masumi_result_hash === paid.resultHash);
 const changed = draftText.replace(`"${draft.new_batteries[0].battery_id}"`, '"ESS-X"');
 const refused = await stageB({...paid, draftText: changed}).then(() => false, e => /does not match/.test(e.message));
 check('stage B refuses a draft changed after payment', refused);
} finally {
 rmSync(store, {recursive: true, force: true});
}

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Draft: ${E2E_DRAFT} (review screen: "Local end-to-end test").`);
process.exit(failed ? 1 : 0);
