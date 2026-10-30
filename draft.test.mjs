import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseJobInput} from './job-input.mjs';
import {createDraftBuilder} from './draft.mjs';
import {prepareDemoJob, sampleExtract, demoTesterKeyPath} from './examples/demo-job.mjs';
import {runDemo} from './battery/run-demo.mjs';

const h = c => c.repeat(64);
const job = {packs:['A','B'],documents:[{doc_id:'a-label',sha256:h('a')},{doc_id:'b-label',sha256:h('b')}],module_tests:[{module_id:'A-M1',sha256:h('c')}],cell_tests:[{module_id:'A-M1',sha256:h('d')}]};

test('job input lists documents and test files by hash',()=>{
 assert.deepEqual(parseJobInput(JSON.stringify(job)),job);
 const bad = patch => () => parseJobInput(JSON.stringify({...job,...patch}));
 assert.throws(()=>parseJobInput('{"prompt":"three packs"}'),/unknown field prompt/);
 assert.throws(bad({documents:[job.documents[0],job.documents[0]]}),/repeats a-label/);
 assert.throws(bad({module_tests:[{module_id:'C-M1',sha256:h('c')}]}),/unlisted pack/);
 assert.throws(bad({cell_tests:[{module_id:'B-M2',sha256:h('d')}]}),/B-M2 has no module test/);
 assert.throws(bad({documents:[{doc_id:'a-label',sha256:h('A')}]}),/lowercase SHA-256/);
});

const withStore = async fn => { const store = mkdtempSync(join(tmpdir(), 'draft-store-')); try { return await fn(store); } finally { rmSync(store, {recursive:true, force:true}); } };

test('stage A on the uploaded demo files gives the same ESS units as the battery demo',async()=>withStore(async store=>{
 const build = createDraftBuilder({extract: sampleExtract}, {storeDir: store, testerPublicKeyPath: demoTesterKeyPath});
 const text = prepareDemoJob(store);
 const draft = JSON.parse(await build(text));
 const expected = runDemo();
 assert.deepEqual(draft.new_batteries, expected.new_batteries);
 assert.deepEqual(draft.held_back, expected.held_back);
 assert.deepEqual(draft.warnings, expected.warnings);
 assert.equal(await build(text), JSON.stringify(draft, null, 2), 'same input, same draft text');
}));

test('stage A stops if a stored file no longer matches the job input',async()=>withStore(async store=>{
 const build = createDraftBuilder({extract: sampleExtract}, {storeDir: store, testerPublicKeyPath: demoTesterKeyPath});
 const job = JSON.parse(prepareDemoJob(store));
 job.documents[0].sha256 = h('f');
 await assert.rejects(()=>build(JSON.stringify(job)), /hash mismatch/);
}));

test('draft refuses to start past the result deadline',async()=>{
 await assert.rejects(()=>createDraftBuilder()(JSON.stringify(job),undefined,Date.now()-1),/deadline expired before ingest/);
});

test('the AI step gets the Masumi result deadline, so model retries stop in time',async()=>withStore(async store=>{
 let seen;
 const build = createDraftBuilder({extract: async (docs, opts) => { seen = opts.deadline; return sampleExtract(docs); }}, {storeDir: store, testerPublicKeyPath: demoTesterKeyPath});
 const deadline = Date.now() + 60_000;
 await build(prepareDemoJob(store), undefined, deadline);
 assert.equal(seen, deadline);
}));
