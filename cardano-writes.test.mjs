import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from './standard-hash.mjs';
import {filesOf} from './cardano-log.mjs';
import {anchorFiles,anchorIndex,writeStageB,writeNewBatteryLog,dryRun,memoryJournal} from './cardano-writes.mjs';
import {generateKey,signDraft} from './cardano-sign.mjs';
const draftText=readFileSync('examples/demo-draft.json','utf8');
const draft=JSON.parse(draftText);
const key=generateKey();
const masumi={blockchainIdentifier:'x'.repeat(200),resultHash:'f'.repeat(64)};
const signed=signDraft(draftText,masumi,key.privateKey);
const ESS=draft.new_batteries.map(b=>b.battery_id);
const STAGE_B=3+2*ESS.length;
// Fake chain: tx<n> is the n-th transaction built. Each fault fires once.
function fakeChain({failPrepareOn,failSendOn,landThenFailOn,failWaitOn}={}){
 const prepared=[],sent=[],landed=new Set();
 return {prepared,sent,
  async prepare(entry){if(prepared.length+1===failPrepareOn){failPrepareOn=null;throw new Error('UTxO Balance Insufficient')}prepared.push(JSON.parse(JSON.stringify(entry)));return {txHash:`tx${prepared.length}`,signedTx:`signed:tx${prepared.length}`,feeLovelace:'180000',sizeBytes:900}},
  async status(txHash){return landed.has(txHash)?'confirmed':null},
  async send(signedTx){const txHash=signedTx.slice('signed:'.length);sent.push(txHash);
   if(txHash===failSendOn){failSendOn=null;throw new Error('network down')}
   landed.add(txHash);
   if(txHash===landThenFailOn){landThenFailOn=null;throw new Error('response lost')}
   return txHash},
  async waitConfirmed(txHash){if(txHash===failWaitOn){failWaitOn=null;throw new Error('timeout')}if(!landed.has(txHash))throw new Error(`${txHash} was never sent`);return {txHash,feeLovelace:'180000',sizeBytes:900}}};
}
async function anchorAll(chain){const journal=memoryJournal();await anchorFiles(filesOf(draft),chain,journal);return anchorIndex(journal.state)}
test('anchoring covers every document and test file once, and a rerun writes nothing new',async()=>{
 const chain=fakeChain();const journal=memoryJournal();
 const out=await anchorFiles(filesOf(draft),chain,journal);
 assert.equal(out.transactions.length,1);
 assert.equal(out.files.length,filesOf(draft).length);
 assert.ok(out.files.every(f=>f.anchor_tx==='tx1'));
 assert.equal(chain.prepared[0].type,'anchor');
 assert.equal(Object.keys(chain.prepared[0].cells).length,draft.test_files.cell_tests.length);
 await anchorFiles(filesOf(draft),chain,journal);
 assert.deepEqual(chain.sent,['tx1']);
});
test('stage B writes the donor logs, then each ESS log followed by its passport',async()=>{
 const chain=fakeChain();const anchors=await anchorAll(chain);
 const out=await writeStageB(signed,draft,chain,{anchors,draftText});
 assert.equal(out.transactions,STAGE_B);
 assert.equal(out.totalFeeLovelace,String(180000*STAGE_B));
 assert.deepEqual(chain.prepared.slice(1).map(e=>e.log??`passport:${e.battery}`),['pack:A','pack:B','pack:C',...ESS.flatMap(id=>[`battery:${id}`,`passport:${id}`])]);
 const ess=chain.prepared[4];
 assert.equal(ess.entries[0].donors['pack:C'].tx,out.logs['pack:C'].txHash);
 assert.equal(chain.prepared[5].log_tx,out.logs['battery:ESS-1'].txHash);
 assert.equal(ess.draft,signed.draft_hash);
 assert.equal(ess.paid,signed.masumi_result_hash);
 assert.equal(ess.masumi.join(''),signed.masumi_blockchain_identifier);
 assert.equal(ess.changes,sha256('none'));
 assert.deepEqual(chain.prepared[1].entries[0].anchors,['tx1']);
});
test('stage B refuses unanchored files, a tampered record, or another draft before building anything',async()=>{
 const chain=fakeChain();
 await assert.rejects(writeStageB(signed,draft,chain,{draftText}),/Not anchored yet: docs:/);
 const anchors=await anchorAll(chain);
 await assert.rejects(writeStageB({...signed,changes:'tampered'},draft,chain,{anchors,draftText}),/signature/);
 await assert.rejects(writeStageB(signed,draft,chain,{anchors,draftText:draftText.replace('"ESS-1"','"ESS-9"')}),/does not match/);
 assert.equal(chain.prepared.length,1);
});
test('ESS logs need confirmed donor logs first',async()=>{
 await assert.rejects(writeNewBatteryLog(signed,draft,fakeChain()),/Write the donor logs first/);
 const journal=memoryJournal();
 for(const pack of draft.packs)journal.state.logs[`pack:${pack}`]={stage:'confirmed',txHash:`tx-${pack}`};
 journal.state.logs['pack:C']={stage:'submitted',txHash:'tx-C'};
 const chain=fakeChain();
 await assert.rejects(writeNewBatteryLog(signed,draft,chain,{journal}),/pack:C is not confirmed/);
 assert.equal(chain.prepared.length,0);
});
test('a build failure saves nothing, so the rerun simply builds again',async()=>{
 const chain=fakeChain({failPrepareOn:3});const journal=memoryJournal();const anchors=await anchorAll(chain);
 await assert.rejects(writeStageB(signed,draft,chain,{journal,anchors}),/Balance Insufficient/);
 assert.equal('pack:B' in journal.state.logs,false);
 await writeStageB(signed,draft,chain,{journal,anchors});
 assert.equal(chain.sent.length,1+STAGE_B);
 assert.equal(new Set(chain.sent).size,chain.sent.length);
});
test('a lost send is resent as the same transaction, and one that landed is never sent again',async()=>{
 const chain=fakeChain({failSendOn:'tx3',landThenFailOn:'tx4'});const journal=memoryJournal();const anchors=await anchorAll(chain);
 await assert.rejects(writeStageB(signed,draft,chain,{journal,anchors}),/Sending pack:B \(tx tx3\) failed: network down/);
 assert.equal(journal.state.logs['pack:B'].stage,'submit-pending');
 await assert.rejects(writeStageB(signed,draft,chain,{journal,anchors}),/Sending pack:C \(tx tx4\) failed: response lost/);
 const out=await writeStageB(signed,draft,chain,{journal,anchors});
 assert.equal(out.logs['pack:B'].txHash,'tx3');
 assert.equal(out.logs['pack:C'].txHash,'tx4');
 assert.equal(chain.sent.filter(h=>h==='tx3').length,2);
 assert.equal(chain.sent.filter(h=>h==='tx4').length,1);
 assert.equal(chain.prepared.length,1+STAGE_B);
});
test('a rerun after a confirmation timeout waits again without resending',async()=>{
 const chain=fakeChain({failWaitOn:'tx4'});const journal=memoryJournal();const anchors=await anchorAll(chain);
 await assert.rejects(writeStageB(signed,draft,chain,{journal,anchors}),/timeout/);
 assert.equal(journal.state.logs['pack:C'].stage,'submitted');
 await writeStageB(signed,draft,chain,{journal,anchors});
 assert.equal(chain.sent.filter(h=>h==='tx4').length,1);
 assert.ok(Object.values(journal.state.logs).every(l=>l.stage==='confirmed'&&!('signedTx' in l)));
});
test('a journal is bound to one signed record, so signing again with other changes cannot mix signatures',async()=>{
 const chain=fakeChain({failWaitOn:'tx3'});const journal=memoryJournal();const anchors=await anchorAll(chain);
 await assert.rejects(writeStageB(signed,draft,chain,{journal,anchors}),/timeout/);
 await assert.rejects(writeStageB(signDraft(draftText,masumi,key.privateKey,'fixed a typo'),draft,chain,{journal,anchors}),/another signed record/);
 await assert.rejects(writeStageB(signDraft(draftText,masumi,generateKey().privateKey),draft,chain,{journal,anchors}),/another signed record/);
 await writeStageB(signDraft(draftText,masumi,key.privateKey),draft,chain,{journal,anchors});
 assert.equal(chain.sent.length,1+STAGE_B);
});
test('dry run prices every write and sends nothing',async()=>{
 const built=[];
 const chain=dryRun({async prepare(entry){built.push(entry);return {txHash:sha256(String(built.length)),signedTx:'unsent',feeLovelace:'200000',sizeBytes:1000}}});
 const anchors=Object.fromEntries(filesOf(draft).map(f=>[f.sha256,'a'.repeat(64)]));
 const out=await writeStageB(signed,draft,chain,{anchors});
 assert.equal(built.length,STAGE_B);
 assert.equal(out.totalFeeLovelace,String(200000*STAGE_B));
 assert.equal(built[3].entries[0].donors['pack:A'].tx,out.logs['pack:A'].txHash);
});
