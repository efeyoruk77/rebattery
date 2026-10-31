import {test} from 'node:test';
import assert from 'node:assert/strict';
import {waitSettled} from './cardano-chain.mjs';

// First real stage B (Oct 31): pack:B was in a block, but Blockfrost still listed pack:A's change,
// so pack:C was built on that spent input and the node refused it ("All inputs are spent").
test('confirmation waits until the wallet view drops the spent input',async()=>{
 const views=[['packA'],['packA'],['packB']];let polls=0;
 const receipt=await waitSettled({txHash:'packB',onChain:async()=>({txHash:'packB'}),walletTxs:async()=>views[polls++],pollMs:1});
 assert.equal(receipt.txHash,'packB');
 assert.equal(polls,3);
});

test('a transaction in a block is reported even if the wallet view stays stale',async()=>{
 const receipt=await waitSettled({txHash:'packB',onChain:async()=>({txHash:'packB'}),walletTxs:async()=>['packA'],timeoutMs:20,pollMs:1});
 assert.equal(receipt.txHash,'packB');
});

test('a transaction never seen still times out',async()=>{
 await assert.rejects(waitSettled({txHash:'packB',onChain:async()=>null,walletTxs:async()=>[],timeoutMs:20,pollMs:1}),/not confirmed within/);
});
