import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sha256} from './standard-hash.mjs';
import {generateKey,publicKeyOf,signHex,verifyHex,signRecord,signDraft,verifySignedRecord} from './cardano-sign.mjs';
const draftText=readFileSync('examples/demo-draft.json','utf8');
const masumi={blockchainIdentifier:'demo-blockchain-identifier',resultHash:'f'.repeat(64)};
test('raw key encoding matches RFC 8032 test vector 1',()=>{
 const privateKey='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
 assert.equal(publicKeyOf(privateKey),'d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
 assert.equal(signHex('',privateKey),'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b');
 assert.equal(verifyHex('',signHex('',privateKey),publicKeyOf(privateKey)),true);
});
test('generated keys are raw 32-byte hex pairs',()=>{
 const key=generateKey();
 assert.match(key.privateKey,/^[0-9a-f]{64}$/);
 assert.equal(key.publicKey,publicKeyOf(key.privateKey));
});
test('signed record covers the exact draft text and any change breaks it',()=>{
 const key=generateKey();
 const signed=signDraft(draftText,masumi,key.privateKey);
 assert.equal(signed.draft_hash,sha256(draftText));
 assert.equal(signed.signer_public_key,key.publicKey);
 assert.equal(verifySignedRecord(signed),true);
 assert.equal(verifySignedRecord(signed,draftText),true);
 assert.equal(verifySignedRecord(signed,draftText.replace('"NB-1"','"NB-2"')),false);
 assert.equal(verifySignedRecord({...signed,changes:'edited'}),false);
 assert.equal(verifySignedRecord({...signed,signer_public_key:generateKey().publicKey}),false);
 assert.equal(verifySignedRecord({...signed,signature:'00'}),false);
 assert.throws(()=>signDraft(draftText,{},key.privateKey),/Masumi/);
 assert.throws(()=>signDraft(JSON.parse(draftText),masumi,key.privateKey),/Draft text/);
});
test('signing the record stage-b.mjs builds gives the same signed record',()=>{
 const key=generateKey();
 const record={draft_hash:sha256(draftText),masumi_result_hash:masumi.resultHash,masumi_blockchain_identifier:masumi.blockchainIdentifier,changes:'none'};
 assert.deepEqual({...record,...signRecord(record,key.privateKey)},signDraft(draftText,masumi,key.privateKey));
});
