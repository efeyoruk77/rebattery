import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {anchorFiles,anchorIndex,writeStageB,writeNewBatteryLog,dryRun,memoryJournal} from './cardano-writes.mjs';
import {generateKey,signDraft} from './cardano-sign.mjs';
const draftText=readFileSync('examples/demo-draft.json','utf8');
const draft=JSON.parse(draftText);
const files=[...draft.documents,...draft.cell_test_files];
const key=generateKey();
const signed=signDraft(draftText,{blockchainIdentifier:'x'.repeat(200),resultHash:'f'.repeat(64)},key.privateKey);
function fakeChain({failWaitOn,failSubmitOn}={}){const submitted=[];return {submitted,
 async submit(entry){if(submitted.length+1===failSubmitOn)throw new Error('network down');submitted.push(entry);return `tx${submitted.length}`},
 async waitConfirmed(txHash){if(txHash===failWaitOn){failWaitOn=null;throw new Error('timeout')}return {txHash,feeLovelace:'180000',sizeBytes:900}}}}
test('anchoring writes one transaction for every document and cell test file',async()=>{
 const chain=fakeChain();const journal=memoryJournal();
 const out=await anchorFiles(files,chain,journal);
 assert.equal(out.txHash,'tx1');
 assert.equal(chain.submitted[0].type,'anchor');
 assert.ok(out.files.every(f=>f.anchor_tx==='tx1'));
 assert.equal(anchorIndex(journal.state)[draft.cell_test_files[0].sha256],'tx1');
 await anchorFiles(files,chain,journal);
 assert.equal(chain.submitted.length,1);
});
test('stage B writes donor logs, then the battery log that links to them, then the passport',async()=>{
 const chain=fakeChain();
 const out=await writeStageB(signed,draft,chain,{draftText});
 assert.equal(out.transactions,5);
 assert.equal(out.totalFeeLovelace,'900000');
 assert.deepEqual(chain.submitted.map(e=>e.log??e.type),['pack:A','pack:B','pack:C','battery:NB-1','passport']);
 const battery=chain.submitted[3];
 assert.equal(battery.entries[0].donors['pack:C'].tx,out.logs['pack:C'].txHash);
 assert.equal(chain.submitted[4].log_tx,out.logs['battery:NB-1'].txHash);
 assert.equal(battery.draft,signed.draft_hash);
 assert.equal(battery.paid,signed.masumi_result_hash);
 assert.equal(battery.masumi.join(''),signed.masumi_blockchain_identifier);
});
test('stage B refuses a signed record that does not match the draft',async()=>{
 const chain=fakeChain();
 await assert.rejects(writeStageB({...signed,changes:'tampered'},draft,chain,{draftText}),/signature/);
 await assert.rejects(writeStageB(signed,draft,chain,{draftText:draftText.replace('"NB-1"','"NB-2"')}),/does not match/);
 assert.equal(chain.submitted.length,0);
});
test('the battery log needs confirmed donor logs first',async()=>{
 await assert.rejects(writeNewBatteryLog(signed,draft,fakeChain()),/Write the donor logs first/);
});
test('a rerun after a confirmation timeout resumes without writing duplicates',async()=>{
 const chain=fakeChain({failWaitOn:'tx3'});const journal=memoryJournal();
 await assert.rejects(writeStageB(signed,draft,chain,{journal}),/timeout/);
 assert.equal(journal.state.logs['pack:C'].stage,'submitted');
 const out=await writeStageB(signed,draft,chain,{journal});
 assert.equal(chain.submitted.length,5);
 assert.equal(out.logs['pack:C'].txHash,'tx3');
 assert.equal(out.totalFeeLovelace,'900000');
 assert.ok(Object.values(journal.state.logs).every(l=>l.stage==='confirmed'));
});
test('an uncertain submit is never retried automatically',async()=>{
 const chain=fakeChain({failSubmitOn:2});const journal=memoryJournal();
 await assert.rejects(writeStageB(signed,draft,chain,{journal}),/network down/);
 assert.equal(journal.state.logs['pack:B'].stage,'submit-pending');
 await assert.rejects(writeStageB(signed,draft,chain,{journal}),/Uncertain submit for pack:B/);
 assert.equal(chain.submitted.length,1);
});
test('a journal from another signed draft is refused',async()=>{
 const journal=memoryJournal();journal.state.draft_hash='0'.repeat(64);
 await assert.rejects(writeStageB(signed,draft,fakeChain(),{journal}),/another signed draft/);
});
test('dry run prices every write and submits nothing',async()=>{
 const built=[];const chain=dryRun({async build(entry){built.push(entry);return {feeLovelace:'200000',sizeBytes:1000}},async submit(){throw new Error('must not submit')}});
 const out=await writeStageB(signed,draft,chain);
 assert.equal(built.length,5);
 assert.equal(out.totalFeeLovelace,'1000000');
 assert.equal(out.logs['battery:NB-1'].sizeBytes,1000);
 assert.match(out.logs['pack:A'].txHash,/^[0-9a-f]{64}$/);
 assert.equal(built[3].entries[0].donors['pack:A'].tx,out.logs['pack:A'].txHash);
});
