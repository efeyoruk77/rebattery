import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseJobInput} from './job-input.mjs';
import {createDraftBuilder,buildDraft} from './draft.mjs';

const h = c => c.repeat(64);
const job = {packs:['A','B'],documents:[{doc_id:'a-label',pack_id:'A',sha256:h('a')},{doc_id:'b-label',pack_id:'B',sha256:h('b')}],cell_test_files:[{file_id:'a-cells',pack_id:'A',sha256:h('c')}]};
const text = JSON.stringify(job);

test('job input lists packs, documents, and cell test files by hash',()=>{
 assert.deepEqual(parseJobInput(text),job);
 const bad = patch => () => parseJobInput(JSON.stringify({...job,...patch}));
 assert.throws(()=>parseJobInput('{"prompt":"three packs"}'),/unknown field prompt/);
 assert.throws(bad({documents:[...job.documents,{doc_id:'x',pack_id:'C',sha256:h('d')}]}),/unlisted pack/);
 assert.throws(bad({documents:[job.documents[0],job.documents[0],job.documents[1]]}),/repeats a-label/);
 assert.throws(bad({documents:[job.documents[0]]}),/Pack B has no documents/);
 assert.throws(bad({cell_test_files:[{file_id:'c-cells',pack_id:'C',sha256:h('c')}]}),/unlisted pack/);
 assert.throws(bad({documents:[{...job.documents[0],sha256:h('A')},job.documents[1]]}),/lowercase SHA-256/);
});

const steps = {
 ingest: async j => ({documents:j.documents.map(d=>({...d,kind:'label',pages:[]})),cellTestFiles:j.cell_test_files,cellTests:[{cell_id:'A-M1-C01',capacity_ah:60}]}),
 extract: async () => [{event_id:'A-e1'}],
 verify: async (d,events) => ({events,rejected:[],warnings:[]}),
 group: async () => [{battery_id:'NB-1'}],
};

test('draft runs every step and returns stable JSON',async()=>{
 const draft = await createDraftBuilder(steps)(text);
 assert.equal(draft,await createDraftBuilder(steps)(text));
 const parsed = JSON.parse(draft);
 assert.deepEqual(Object.keys(parsed),['packs','documents','events','rejected','warnings','cell_test_files','cell_tests','new_batteries']);
 assert.equal(parsed.new_batteries[0].battery_id,'NB-1');
});

test('draft stops when a stored file differs from its listed hash',async()=>{
 let extracted = false;
 const swappedDoc = {...steps,ingest:async j=>({documents:j.documents.map(d=>({...d,sha256:h('f')})),cellTestFiles:j.cell_test_files}),extract:async()=>{extracted=true;return []}};
 await assert.rejects(()=>createDraftBuilder(swappedDoc)(text),/a-label is missing or does not match/);
 const swappedCells = {...steps,ingest:async j=>({documents:j.documents,cellTestFiles:[{...j.cell_test_files[0],sha256:h('f')}]}),extract:async()=>{extracted=true;return []}};
 await assert.rejects(()=>createDraftBuilder(swappedCells)(text),/a-cells is missing or does not match/);
 assert.equal(extracted,false);
});

test('draft refuses to start past the result deadline',async()=>{
 await assert.rejects(()=>createDraftBuilder(steps)(text,undefined,Date.now()-1),/deadline expired before ingest/);
});

test('unconnected steps name their owner',async()=>{
 await assert.rejects(()=>buildDraft(text),/"ingest" is not connected yet \(owner: Member 1\)/);
});
