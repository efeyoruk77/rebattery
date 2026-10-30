import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resultHash} from './standard-hash.mjs';
import {createStageB} from './stage-b.mjs';
import {createCardanoSteps} from './cardano-steps.mjs';
import {memoryJournal} from './cardano-writes.mjs';
import {generateKey,verifySignedRecord} from './cardano-sign.mjs';
import {trace,checkTrace} from './cardano-trace.mjs';
const draftText=readFileSync('examples/demo-draft.json','utf8');
const draft=JSON.parse(draftText);
const nonce='aabbccddeeff0011';
const paid={draftText,nonce,resultHash:resultHash(draftText,nonce),blockchainIdentifier:'demo-blockchain-id'};
function fakeChain(){const txs=[];return {txs,async submit(entry){txs.push(JSON.parse(JSON.stringify(entry)));return `tx${txs.length}`},async waitConfirmed(txHash){return {txHash,feeLovelace:'1'}},read:async h=>txs[Number(h.slice(2))-1]??null}}
const steps=(chain,options={})=>createCardanoSteps({chain,key:generateKey().privateKey,journal:()=>memoryJournal(),anchorJournal:memoryJournal(),read:()=>undefined,...options});
test('stage-b.mjs signs and publishes the paid demo draft through the Cardano steps',async()=>{
 const chain=fakeChain();const s=steps(chain,{enabled:true});
 const anchored=await s.anchor([...draft.documents,...draft.cell_test_files]);
 assert.ok(anchored.every(f=>f.anchor_tx==='tx1'));
 const out=await createStageB(s)(paid);
 assert.equal(verifySignedRecord(out.signedRecord,draftText),true);
 assert.deepEqual(out.donorTxs,['tx2','tx3','tx4']);
 assert.deepEqual(out.newBatteryTxs,['tx5','tx6']);
 assert.deepEqual(checkTrace(await trace('tx6',chain.read),draftText,out.signedRecord),[]);
});
test('writes stay off until enabled, and signing alone never touches the chain',async()=>{
 const chain=fakeChain();
 await assert.rejects(createStageB(steps(chain))(paid),/Cardano writes are disabled/);
 assert.equal(chain.txs.length,0);
});
test('the real chain is never created under node --test',async()=>{
 await assert.rejects(createStageB(steps(undefined,{enabled:true}))(paid),/never run under node --test/);
});
