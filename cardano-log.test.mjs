import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from './standard-hash.mjs';
import {canonical,hashJson,eventsRoot,chunk64,unchunk,metadatum,assertMetadatum,cleanError,filesOf,anchorEntries,donorLogEntry,essEntry,passportEntry,MAX_ENTRY_BYTES} from './cardano-log.mjs';
const draft=JSON.parse(readFileSync('examples/demo-draft.json','utf8'));
const hex=(c,n)=>c.repeat(n);
const signed={draft_hash:hex('a',64),masumi_result_hash:hex('b',64),masumi_blockchain_identifier:hex('c',150),changes:'none',signer_public_key:hex('d',64),signature:hex('e',128)};
const ess1=draft.new_batteries[0];
const bytes=entry=>Buffer.byteLength(canonical(entry),'utf8');
test('canonical JSON ignores key order and drops undefined',()=>{
 assert.equal(canonical({b:1,a:[{d:null,c:'x'}],e:undefined}),'{"a":[{"c":"x","d":null}],"b":1}');
 assert.equal(hashJson({b:1,a:2}),hashJson({a:2,b:1}));
});
test('events root is order independent and content sensitive',()=>{
 const [a,b]=draft.events;
 assert.equal(eventsRoot([a,b]),eventsRoot([b,a]));
 assert.notEqual(eventsRoot([a,b]),eventsRoot([a,{...b,date:'1999-01-01'}]));
});
test('chunking splits by UTF-8 bytes between characters and round-trips',()=>{
 assert.deepEqual(chunk64(hex('x',130)).map(p=>p.length),[64,64,2]);
 const umlauts='ü'.repeat(40);
 const pieces=chunk64(umlauts);
 assert.ok(pieces.length>1&&pieces.every(p=>Buffer.byteLength(p,'utf8')<=64));
 assert.equal(unchunk(pieces),umlauts);
 assert.equal(unchunk('short'),'short');
});
test('draft values become valid metadata: decimals and booleans as text, null dropped, long text split',()=>{
 assert.deepEqual(metadatum({soh_pct:86.5,cell_count:48,ok:true,note:null,list:[1,null,2.5],name:hex('n',70)}),
  {soh_pct:'86.5',cell_count:48,ok:'true',list:[1,'2.5'],name:[hex('n',64),hex('n',6)]});
 assertMetadatum(metadatum(ess1.health));
 assertMetadatum(metadatum(ess1.second_life_facility));
});
test('metadata validator rejects what Cardano metadata cannot hold',()=>{
 assertMetadatum({a:'x',n:3,l:['y',{z:1}]});
 assert.throws(()=>assertMetadatum({a:null}),/null/);
 assert.throws(()=>assertMetadatum({a:true}),/boolean/);
 assert.throws(()=>assertMetadatum({a:1.5}),/safe integer/);
 assert.throws(()=>assertMetadatum({a:2**60}),/safe integer/);
 assert.throws(()=>assertMetadatum({a:'é'.repeat(33)}),/64 bytes/);
 assert.throws(()=>assertMetadatum({[hex('k',65)]:'v'}),/key/);
});
test('errors thrown as strings become Errors without the secret',()=>{
 const e=cleanError(JSON.stringify({status:403,data:'bad project_id preprodSECRET'}),'preprodSECRET');
 assert.ok(e instanceof Error);
 assert.match(e.message,/403/);
 assert.doesNotMatch(e.message,/preprodSECRET/);
 assert.equal(cleanError(new Error('boom')).message,'boom');
 assert.equal(cleanError({code:'ECONNRESET'}).message,'{"code":"ECONNRESET"}');
});
test('files of a draft and of a job input are grouped like the upload store',()=>{
 const files=filesOf(draft);
 assert.equal(files.length,draft.documents.length+draft.test_files.module_tests.length+draft.test_files.cell_tests.length);
 assert.deepEqual([...new Set(files.map(f=>f.group))],['docs','test','cells']);
 assert.ok(files.every(f=>draft.packs.includes(f.pack)));
 const job={packs:['A'],documents:[{doc_id:'d1',sha256:hex('1',64)}],module_tests:[{module_id:'A-M1',sha256:hex('2',64)}],cell_tests:[{module_id:'A-M1',sha256:hex('3',64)}]};
 assert.deepEqual(filesOf(job).map(f=>`${f.group}:${f.id}`),['docs:d1','test:A-M1','cells:A-M1']);
});
test('anchor entries keep the module test and cell test of one module apart, refuse duplicates, and split large uploads',()=>{
 const files=filesOf(draft);
 const [entry,...rest]=anchorEntries(files);
 assert.equal(rest.length,0);
 assert.equal(entry.test['A-M1'],draft.test_files.module_tests.find(t=>t.module_id==='A-M1').sha256);
 assert.equal(entry.cells['A-M1'],draft.test_files.cell_tests.find(t=>t.module_id==='A-M1').sha256);
 assert.notEqual(entry.test['A-M1'],entry.cells['A-M1']);
 const split=anchorEntries(files,1000);
 assert.ok(split.length>1);
 assert.equal(split.reduce((n,e)=>n+['docs','test','cells'].reduce((m,g)=>m+Object.keys(e[g]??{}).length,0),0),files.length);
 assert.throws(()=>anchorEntries([...files,files[0]]),/listed twice/);
 assert.throws(()=>anchorEntries([{group:'docs',id:'x',sha256:'nope'}]),/sha256/);
 assert.throws(()=>anchorEntries([{group:'docs',id:hex('i',65),sha256:hex('1',64)}]),/64 bytes/);
});
test('a job input at its limits is anchored in transactions that each fit',()=>{
 const files=Array.from({length:500},(_,i)=>({group:['docs','test','cells'][i%3],id:String(i).padStart(64,'x'),sha256:sha256(String(i))}));
 const entries=anchorEntries(files);
 assert.ok(entries.length>1&&entries.every(e=>bytes(e)<=MAX_ENTRY_BYTES));
});
test('donor log: events root, file anchors, modules per ESS, and what was held back',()=>{
 const anchorIndex=Object.fromEntries(filesOf(draft).map(f=>[`${f.group}:${f.id}`,{sha256:f.sha256,tx:`anchor-${f.pack}`}]));
 const entry=donorLogEntry('A',draft,signed,{anchorIndex});
 const events=draft.events.filter(e=>e.pack_id==='A');
 assert.equal(entry.log,'pack:A');
 assert.deepEqual(entry.entries[0],{type:'events',root:eventsRoot(events),count:events.length,anchors:['anchor-A']});
 const {to,not_taken_apart,unused_cells}=entry.entries[1];
 assert.deepEqual(not_taken_apart,['A-M4']);
 assert.deepEqual(unused_cells,draft.held_back.filter(h=>h.level==='cell'&&h.id.startsWith('A-')).map(h=>h.id));
 assert.deepEqual(Object.keys(to),draft.new_batteries.filter(b=>b.cells.some(c=>c.donor_pack==='A')).map(b=>b.battery_id));
 for(const b of draft.new_batteries)assert.deepEqual(new Set(to[b.battery_id]??[]),new Set(b.cells.filter(c=>c.donor_pack==='A').map(c=>c.module_id)));
 assert.ok(!Object.values(to).flat().includes('A-M4'));
 assert.equal(entry.changes,sha256('none'));
 assert.deepEqual(entry.masumi,chunk64(signed.masumi_blockchain_identifier));
 assert.equal('anchors' in donorLogEntry('A',draft,signed).entries[0],false);
 assert.equal(donorLogEntry('B',draft,signed,{prev:'tx-prev',index:1}).prev,'tx-prev');
});
test('ESS log lists every cell under its module and donor pack, with health and facility',()=>{
 const donorTx={'pack:A':'txA','pack:B':'txB','pack:C':'txC'};
 const [assembled]=essEntry(ess1,draft,signed,donorTx).entries;
 assert.equal(assembled.type,'assembled_from');
 assert.equal(assembled.count,ess1.cells.length);
 const listed=Object.entries(assembled.donors).flatMap(([log,d])=>Object.entries(d.modules).flatMap(([m,cells])=>cells.map(c=>`${log}|${m}|${c}`))).sort();
 assert.deepEqual(listed,ess1.cells.map(c=>`pack:${c.donor_pack}|${c.module_id}|${c.cell_id}`).sort());
 assert.equal(assembled.donors['pack:B'].tx,'txB');
 assert.equal(assembled.health.soh_pct,String(ess1.health.soh_pct));
 assert.equal(assembled.health.cell_count,ess1.health.cell_count);
 assert.equal(assembled.facility.id,ess1.second_life_facility.id);
 assert.throws(()=>essEntry(ess1,draft,signed,{'pack:A':'txA'}),/No donor log transaction/);
});
test('passport points at the ESS log and carries what the QR card shows',()=>{
 const p=passportEntry(ess1,'txESS');
 assert.deepEqual(Object.keys(p),['v','type','battery','log_tx','health','facility']);
 assert.equal(p.battery,'ESS-1');
 assert.equal(p.log_tx,'txESS');
 assert.deepEqual(p.health,metadatum(ess1.health));
});
test('an entry too large for one transaction is refused before it is built',()=>{
 const cells=Array.from({length:1200},(_,i)=>({cell_id:`A-M${100+(i>>4)}-C${100+i}`,module_id:`A-M${100+(i>>4)}`,donor_pack:'A'}));
 assert.throws(()=>essEntry({...ess1,cells},draft,signed,{'pack:A':hex('1',64)}),/too large for one transaction/);
});
test('every demo entry fits one transaction',()=>{
 const donorTx={'pack:A':hex('1',64),'pack:B':hex('2',64),'pack:C':hex('3',64)};
 const all=[...anchorEntries(filesOf(draft)),...draft.packs.map(p=>donorLogEntry(p,draft,signed)),...draft.new_batteries.flatMap(b=>[essEntry(b,draft,signed,donorTx),passportEntry(b,hex('4',64))])];
 assert.ok(all.every(e=>bytes(e)<MAX_ENTRY_BYTES));
});
