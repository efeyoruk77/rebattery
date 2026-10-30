import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical,hashJson,eventsRoot,chunk64,unchunk,assertMetadatum,anchorEntry,donorLogEntry,newBatteryEntry,passportEntry} from './cardano-log.mjs';
const draft=JSON.parse(readFileSync('examples/demo-draft.json','utf8'));
const hex=(c,n)=>c.repeat(n);
const signed={draft_hash:hex('a',64),masumi_result_hash:hex('b',64),masumi_blockchain_identifier:hex('c',150),signer_public_key:hex('d',64),signature:hex('e',128)};
const files=[...draft.documents,...draft.cell_test_files];
test('canonical JSON ignores key order and drops undefined',()=>{
 assert.equal(canonical({b:1,a:[{d:null,c:'x'}],e:undefined}),'{"a":[{"c":"x","d":null}],"b":1}');
 assert.equal(hashJson({b:1,a:2}),hashJson({a:2,b:1}));
});
test('events root is order independent and content sensitive',()=>{
 const [a,b]=draft.events;
 assert.equal(eventsRoot([a,b]),eventsRoot([b,a]));
 assert.notEqual(eventsRoot([a,b]),eventsRoot([a,{...b,date:'1999-01-01'}]));
});
test('chunking keeps every piece within 64 bytes and round-trips',()=>{
 const pieces=chunk64(hex('x',130));
 assert.deepEqual(pieces.map(p=>p.length),[64,64,2]);
 assert.equal(unchunk(pieces),hex('x',130));
 assert.equal(unchunk('short'),'short');
});
test('metadata validator rejects what Cardano metadata cannot hold',()=>{
 assertMetadatum({a:'x',n:3,l:['y',{z:1}]});
 assert.throws(()=>assertMetadatum({a:null}),/null/);
 assert.throws(()=>assertMetadatum({a:true}),/boolean/);
 assert.throws(()=>assertMetadatum({a:1.5}),/integer/);
 assert.throws(()=>assertMetadatum({a:'é'.repeat(33)}),/64 bytes/);
 assert.throws(()=>assertMetadatum({[hex('k',65)]:'v'}),/key/);
});
test('anchor entry maps every document and cell test file to its hash',()=>{
 const entry=anchorEntry(files);
 assert.equal(entry.type,'anchor');
 assert.equal(Object.keys(entry.docs).length,13);
 assert.equal(entry.docs['packA-invoice-2021-de'],draft.documents.find(d=>d.doc_id==='packA-invoice-2021-de').sha256);
 assert.equal(entry.docs['packB-cell-tests'],draft.cell_test_files.find(f=>f.file_id==='packB-cell-tests').sha256);
 assert.throws(()=>anchorEntry([{doc_id:'x',sha256:'nope'}]),/sha256/);
});
test('donor log batch holds the pack events root and where each cell went',()=>{
 const entry=donorLogEntry('A',draft,signed);
 assert.equal(entry.log,'pack:A');
 assert.equal(entry.index,0);
 assert.equal('prev' in entry,false);
 assert.deepEqual(entry.entries[0],{type:'events',root:eventsRoot(draft.events.filter(e=>e.pack_id==='A')),count:5});
 const {to,held}=entry.entries[1];
 assert.equal(to['NB-1'].length,27);
 assert.ok(!to['NB-1'].includes('A-M4-C01'));
 assert.deepEqual(held,['A-M4-C01','A-M4-C02','A-M4-C03','A-M4-C04','A-M2-C03']);
 assert.deepEqual(entry.masumi,chunk64(signed.masumi_blockchain_identifier));
 assert.equal(entry.signer,signed.signer_public_key);
 const anchorIndex=Object.fromEntries(files.map(f=>[f.sha256,f.pack_id==='A'?'txA':'txOther']));
 assert.deepEqual(donorLogEntry('A',draft,signed,{anchorIndex}).entries[0].anchors,['txA']);
 const next=donorLogEntry('B',draft,signed,{prev:'tx-prev',index:1});
 assert.equal(next.prev,'tx-prev');
 assert.equal(next.entries[1].held.length,9);
});
test('new battery batch lists cells per donor with the donor log transaction and test file hash',()=>{
 const donorTx={'pack:A':'txA','pack:B':'txB','pack:C':'txC'};
 const [assembled]=newBatteryEntry(draft.new_batteries[0],draft,signed,donorTx).entries;
 assert.equal(assembled.type,'assembled_from');
 assert.equal(assembled.count,81);
 assert.equal(assembled.cell_model,draft.new_batteries[0].cell_model);
 assert.deepEqual(Object.entries(assembled.donors).map(([k,d])=>[k,d.tx,d.cells.length]),[['pack:A','txA',27],['pack:B','txB',23],['pack:C','txC',31]]);
 assert.equal(assembled.donors['pack:C'].test_file,draft.cell_test_files.find(f=>f.pack_id==='C').sha256);
 assert.throws(()=>newBatteryEntry(draft.new_batteries[0],draft,signed,{'pack:A':'txA'}),/pack B/);
});
test('passport points at the battery log head',()=>{
 assert.deepEqual(passportEntry('NB-1','txNB'),{v:1,type:'passport',battery:'NB-1',log_tx:'txNB'});
});
