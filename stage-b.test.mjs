import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resultHash,sha256} from './standard-hash.mjs';
import {createStageB,finalize} from './stage-b.mjs';

const draftText = readFileSync('examples/demo-draft.json', 'utf8');
const nonce = 'aabbccddeeff0011';
const paid = {draftText, nonce, resultHash: resultHash(draftText, nonce), blockchainIdentifier: 'demo-blockchain-id'};

test('signed record points at the exact paid draft',async()=>{
 let signed;
 const run = createStageB({sign:async r=>{signed=r;return {signer_public_key:'pk',signature:'sig'}},writeDonorLogs:async()=>['tx1'],writeNewBatteryLog:async()=>['tx2']});
 const out = await run(paid);
 assert.equal(signed.draft_hash, sha256(draftText));
 assert.equal(signed.masumi_result_hash, paid.resultHash);
 assert.equal(out.signedRecord.signature, 'sig');
 assert.deepEqual([out.donorTxs, out.newBatteryTxs], [['tx1'], ['tx2']]);
});

test('a draft edited after payment is never signed',async()=>{
 let signs = 0;
 const run = createStageB({sign:async()=>{signs++;return {}}});
 await assert.rejects(()=>run({...paid, draftText: draftText.replace('"NB-1"', '"NB-2"')}), /does not match the result hash/);
 assert.equal(signs, 0);
});

test('Sokosumi task drafts are checked with the task hash, without the nonce',async()=>{
 const run = createStageB({sign:async()=>({}),writeDonorLogs:async()=>[],writeNewBatteryLog:async()=>[]});
 const out = await run({draftText, hashScheme:'task', resultHash: sha256(draftText), blockchainIdentifier:'demo'});
 assert.equal(out.signedRecord.masumi_result_hash, sha256(draftText));
 await assert.rejects(()=>run({draftText, hashScheme:'task', resultHash: paid.resultHash, blockchainIdentifier:'demo'}), /does not match/);
});

test('unconnected signing names its owner',async()=>{
 await assert.rejects(()=>finalize(paid), /"sign" is not connected yet \(owner: Member 3\)/);
});
