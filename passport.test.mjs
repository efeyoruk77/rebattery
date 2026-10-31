import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filesOf} from './cardano-log.mjs';
import {anchorFiles,anchorIndex,writeStageB,memoryJournal} from './cardano-writes.mjs';
import {generateKey,signDraft} from './cardano-sign.mjs';
import {passportView,chainReader} from './passport.mjs';
const draftText=readFileSync('examples/demo-draft.json','utf8');

// Full stage B run on a fake chain, as in cardano-trace.test.mjs.
async function run(){
 const draft=JSON.parse(draftText),txs=[];
 const chain={async prepare(entry){txs.push(JSON.parse(JSON.stringify(entry)));return {txHash:`tx${txs.length}`,signedTx:'x'}},async status(){return null},async send(){},async waitConfirmed(txHash){return {txHash,feeLovelace:'1'}}};
 const anchorJournal=memoryJournal();
 await anchorFiles(filesOf(draft),chain,anchorJournal);
 const signed=signDraft(draftText,{blockchainIdentifier:'m'.repeat(120),resultHash:'f'.repeat(64)},generateKey().privateKey);
 const out=await writeStageB(signed,draft,chain,{anchors:anchorIndex(anchorJournal.state),draftText});
 return {signed,passport:out.logs['passport:ESS-1'].txHash,read:async h=>txs[Number(h.slice(2))-1]??null};
}

test('the passport page shows the history with quotes only from a draft that matches the chain',async()=>{
 const {signed,passport,read}=await run();
 const v=await passportView(passport,read,[{id:'demo',label:'Demo',draftText}],{signedFor:id=>id==='demo'?signed:null});
 assert.equal(v.ess.battery_id,'ESS-1');
 assert.equal(v.draft.id,'demo');
 assert.ok(v.checks.every(c=>c.ok===true),JSON.stringify(v.checks));
 const a=v.donors.find(d=>d.pack==='A');
 assert.equal(a.events.find(e=>e.event_id==='A-e4').source.quote,'Modul 4 ersetzt (Grund: Zellungleichgewicht)');
 assert.match(a.notTakenApart.find(m=>m.id==='A-M4').reason,/soh_after_replacement/);
 assert.ok(a.documents.length&&a.documents.every(d=>d.anchorTx),'every document of pack A is anchored with its hash');
 assert.equal(v.payment.testRun,false);
 // An edited draft supplies no history, and without the signed record the signature is reported as not checked.
 const edited=JSON.parse(draftText);edited.events.find(e=>e.pack_id==='A').date='1999-01-01';
 const other=await passportView(passport,read,[{id:'x',label:'Edited',draftText:JSON.stringify(edited)}]);
 assert.equal(other.draft,null);
 assert.equal(other.donors[0].events,undefined);
 assert.equal(other.checks[2].ok,false);
 assert.equal(other.checks[3].ok,null);
});

test('the chain reader takes our label from Blockfrost or Koios and treats an unknown transaction as missing',async()=>{
 const meta={type:'passport'};
 const blockfrost=chainReader({apiKey:'k',fetchImpl:async url=>url.endsWith('/missing/metadata')?{status:404,ok:false}:{status:200,ok:true,json:async()=>[{label:'1',json_metadata:{}},{label:'1542',json_metadata:meta}]}});
 assert.deepEqual(await blockfrost('abc'),meta);
 assert.equal(await blockfrost('missing'),null);
 const koios=chainReader({apiKey:'',fetchImpl:async()=>({ok:true,json:async()=>[{tx_hash:'abc',metadata:{1542:meta}}]})});
 assert.deepEqual(await koios('abc'),meta);
});

test('the demo draft shows a QR code for each recorded test-run passport, and only for its own ESS units',async()=>{
 const {passportQrs}=await import('./review.mjs');
 const qrs=await passportQrs('demo');
 assert.deepEqual(Object.keys(qrs).sort(),JSON.parse(draftText).new_batteries.map(b=>b.battery_id).sort());
 assert.ok(Object.values(qrs).every(q=>q.testRun&&q.svg.startsWith('<svg')&&q.url.replace(/\/$/,'').endsWith(q.txHash)));
 assert.deepEqual(await passportQrs('job-unsigned'),{});
});

// Bug: the demo draft was regenerated after the test run was written to Cardano, so no draft matched the
// passports and the public site hid every history. Passports match against a fixed copy of the on-chain draft.
test('passports can match the demo draft exactly as it was written to Cardano',async()=>{
 const {createHash}=await import('node:crypto');
 const {listDrafts,passportDrafts}=await import('./review.mjs');
 const copy=passportDrafts().find(d=>d.id==='demo-onchain');
 assert.ok(copy,'examples/demo-onchain-draft.json is offered to passports');
 assert.equal(createHash('sha256').update(copy.draftText).digest('hex'),'1aede4c49485675ddc8fd69afe3a0b88d8058f7ea7c6817e363b40bf2b37ff2a','the on-chain copy must never be regenerated: its bytes are what the test run signed');
 assert.ok(!listDrafts().some(d=>d.id==='demo-onchain'),'the copy is not listed on the review screen');
});

// Bug: the test-run passports showed "Company signature not checked" because its signed record was not in the repo.
test('the test-run signed record verifies against the on-chain demo copy',async()=>{
 const {verifySignedRecord}=await import('./cardano-sign.mjs');
 const {passportDrafts,signedRecordFor}=await import('./review.mjs');
 const copy=passportDrafts().find(d=>d.id==='demo-onchain');
 const signed=signedRecordFor('demo-onchain');
 assert.equal(signed.note,undefined,'the note is stripped before checking');
 assert.ok(verifySignedRecord(signed,copy.draftText));
});
