import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filesOf} from './cardano-log.mjs';
import {anchorFiles,anchorIndex,writeStageB,memoryJournal} from './cardano-writes.mjs';
import {generateKey,signDraft} from './cardano-sign.mjs';
import {trace,checkTrace} from './cardano-trace.mjs';
const defaultDraft=readFileSync('examples/demo-draft.json','utf8'),draftText=defaultDraft;
const draft=JSON.parse(draftText);
// Full run on a fake chain; read returns metadata as it comes back from the chain (JSON round trip).
async function run(draftText=defaultDraft){const draft=JSON.parse(draftText);
 const txs=[];
 const chain={async prepare(entry){txs.push(JSON.parse(JSON.stringify(entry)));return {txHash:`tx${txs.length}`,signedTx:'x'}},async status(){return null},async send(){},async waitConfirmed(txHash){return {txHash,feeLovelace:'1'}}};
 const anchorJournal=memoryJournal();
 await anchorFiles(filesOf(draft),chain,anchorJournal);
 const signed=signDraft(draftText,{blockchainIdentifier:'m'.repeat(120),resultHash:'f'.repeat(64)},generateKey().privateKey);
 const out=await writeStageB(signed,draft,chain,{anchors:anchorIndex(anchorJournal.state),draftText});
 return {txs,signed,draftText,passports:draft.new_batteries.map(b=>out.logs[`passport:${b.battery_id}`].txHash),read:async h=>txs[Number(h.slice(2))-1]??null};
}
test('every ESS passport traces back to all its donor logs and file anchors, and matches the draft',async()=>{
 const {signed,passports,read}=await run();
 assert.equal(passports.length,draft.new_batteries.length);
 for(const p of passports)assert.deepEqual(checkTrace(await trace(p,read),draftText,signed),[]);
 const t=await trace(passports[0],read);
 assert.equal(t.passport.battery,'ESS-1');
 assert.deepEqual(Object.keys(t.donors),['pack:A','pack:B','pack:C']);
 assert.deepEqual(Object.keys(t.donors['pack:A'].anchors),['tx1']);
 assert.ok(Object.values(t.donors).every(d=>!d.unlinked.length));
});
test('trace check catches an edited draft, a broken back link, a missing anchor, changed health, and a wrong start',async()=>{
 const {txs,signed,passports,read}=await run();
 const edited=JSON.parse(draftText);edited.new_batteries[0].health.soh_pct=99;edited.events.find(e=>e.pack_id==='A').date='1999-01-01';
 const problems=checkTrace(await trace(passports[0],read),JSON.stringify(edited,null,2),signed);
 for(const p of ['signed record does not verify against the draft','ESS-1 ESS log: health differs from the draft','ESS-1 passport: health differs from the draft','pack:A: events root differs from the draft'])assert.ok(problems.includes(p),p);
 assert.ok(checkTrace(await trace(passports[0],read),draftText,{...signed,changes:'other'}).includes('pack:A: on-chain changes differs from the signed record'));
 const donorA=txs[1].entries[1],moved=donorA.to['ESS-1'][0];
 donorA.to['ESS-1']=donorA.to['ESS-1'].slice(1);
 delete txs[0].docs['packA-label'];
 txs[5].health.soh_pct='99';
 const tampered=checkTrace(await trace(passports[0],read),draftText,signed);
 for(const p of [`${moved}: pack:A log does not send it to ESS-1`,'docs:packA-label: not anchored with its draft hash','ESS-1 passport: health differs from the draft'])assert.ok(tampered.includes(p),p);
 await assert.rejects(trace('tx2',read),/not a passport/);
});
test('trace has no false alarms for cells without module_id or a missing facility',async()=>{
 const d=JSON.parse(draftText);
 for(const b of d.new_batteries)for(const c of b.cells)delete c.module_id;
 d.new_batteries[0].second_life_facility=null;
 const r=await run(JSON.stringify(d,null,2));
 for(const p of r.passports)assert.deepEqual(checkTrace(await trace(p,r.read),r.draftText,r.signed),[]);
});
test('trace catches a changed cell model and a signature that is not the company key',async()=>{
 const {txs,signed,passports,read}=await run();
 txs[4].entries[0].cell_model='OTHER';
 const problems=checkTrace(await trace(passports[0],read),draftText,signed,{companyKey:'f'.repeat(64)});
 assert.ok(problems.includes('ESS-1 ESS log: cell_model differs from the draft'));
 assert.ok(problems.includes('signed record is not signed with the company key'));
 assert.ok(!checkTrace(await trace(passports[1],read),draftText,signed,{companyKey:signed.signer_public_key}).length);
});
