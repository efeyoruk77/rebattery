import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resultHash} from './standard-hash.mjs';
import {createStageB} from './stage-b.mjs';
import {createCardanoSteps,fileJournal} from './cardano-steps.mjs';
import {memoryJournal} from './cardano-writes.mjs';
import {generateKey,verifySignedRecord} from './cardano-sign.mjs';
import {trace,checkTrace} from './cardano-trace.mjs';
const draftText=readFileSync('examples/demo-draft.json','utf8');
const draft=JSON.parse(draftText);
const nonce='aabbccddeeff0011';
const paid={draftText,nonce,resultHash:resultHash(draftText,nonce),blockchainIdentifier:'demo-blockchain-id'};
const STAGE_B=3+2*draft.new_batteries.length;
function fakeChain(){const txs=[],sent=[];return {txs,sent,
 async prepare(entry){txs.push(JSON.parse(JSON.stringify(entry)));return {txHash:`tx${txs.length}`,signedTx:`tx${txs.length}`}},
 async status(){return null},async send(signedTx){sent.push(signedTx)},async waitConfirmed(txHash){return {txHash,feeLovelace:'1'}},
 read:async h=>txs[Number(h.slice(2))-1]??null}}
const memoryLock=()=>{let held=false;return ()=>{if(held)throw new Error('Another Cardano write is running.');held=true;return ()=>{held=false}}};
function steps(chain,options={}){
 const journal=memoryJournal(),anchors=memoryJournal();
 return createCardanoSteps({chain,key:generateKey().privateKey,journal:()=>journal,anchorJournal:()=>anchors,lock:memoryLock(),read:()=>undefined,...options});
}
test('stage-b.mjs signs the paid demo draft and publishes every log and passport through the Cardano steps',async()=>{
 const chain=fakeChain();const s=steps(chain,{enabled:true});
 assert.ok((await s.anchor(draft)).every(f=>f.anchor_tx==='tx1'));
 const out=await createStageB(s)(paid);
 assert.equal(verifySignedRecord(out.signedRecord,draftText),true);
 assert.deepEqual(out.donorTxs,['tx2','tx3','tx4']);
 assert.equal(out.newBatteryTxs.length,2*draft.new_batteries.length);
 const passports=s.passports(out.signedRecord);
 assert.deepEqual(Object.keys(passports),draft.new_batteries.map(b=>b.battery_id));
 assert.equal(passports['ESS-1'].url,'https://preprod.cardanoscan.io/transaction/tx6');
 for(const {txHash} of Object.values(passports))assert.deepEqual(checkTrace(await trace(txHash,chain.read),draftText,out.signedRecord),[]);
});
test('writes stay off until enabled, and signing alone never touches the chain',async()=>{
 const chain=fakeChain();
 await assert.rejects(createStageB(steps(chain))(paid),/Cardano writes are disabled/);
 await assert.rejects(steps(chain).anchor(draft),/Cardano writes are disabled/);
 assert.equal(chain.txs.length,0);
});
test('the real chain is never created under node --test',async()=>{
 await assert.rejects(createStageB(steps(undefined,{enabled:true}))(paid),/never run under node --test/);
});
test('a second Sign click while one is writing is refused, and nothing is written twice',async()=>{
 const chain=fakeChain();const s=steps(chain,{enabled:true});
 await s.anchor(draft);
 const finalize=createStageB(s);
 const results=await Promise.allSettled([finalize(paid),finalize(paid)]);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
 assert.match(results.find(r=>r.status==='rejected').reason.message,/Another Cardano write is running/);
 assert.equal(chain.sent.length,1+STAGE_B);
 assert.equal(new Set(chain.sent).size,chain.sent.length);
});
test('the file journal is replaced in one step and read back as saved',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cardano-journal-'));
 try{
  const path=join(dir,'nested','journal.json');
  const journal=fileJournal(path);
  journal.state.logs.k={stage:'confirmed',txHash:'tx1'};
  journal.save(journal.state);
  assert.deepEqual(fileJournal(path).state,{logs:{k:{stage:'confirmed',txHash:'tx1'}}});
  assert.deepEqual(readdirSync(join(dir,'nested')),['journal.json']);
 }finally{rmSync(dir,{recursive:true})}
});
