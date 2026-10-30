import {generateKeyPairSync,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {hashJson} from './cardano-log.mjs';
import {sha256} from './standard-hash.mjs';
// DER prefixes for raw Ed25519 keys, so keys are stored as plain 64-hex strings.
const PKCS8='302e020100300506032b657004220420',SPKI='302a300506032b6570032100';
const privateKey=hex=>createPrivateKey({key:Buffer.from(PKCS8+hex,'hex'),format:'der',type:'pkcs8'});
const publicKey=hex=>createPublicKey({key:Buffer.from(SPKI+hex,'hex'),format:'der',type:'spki'});
const rawPublic=key=>key.export({format:'der',type:'spki'}).toString('hex').slice(SPKI.length);
// The second-life company's own key. Separate from the agent wallet: the company signs, the agent only submits.
export function generateKey(){const pair=generateKeyPairSync('ed25519');return {privateKey:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('hex').slice(PKCS8.length),publicKey:rawPublic(pair.publicKey)}}
export const publicKeyOf=privateHex=>rawPublic(createPublicKey(privateKey(privateHex)));
export const signHex=(messageHex,privateHex)=>sign(null,Buffer.from(messageHex,'hex'),privateKey(privateHex)).toString('hex');
export const verifyHex=(messageHex,signatureHex,publicHex)=>verify(null,Buffer.from(messageHex,'hex'),publicKey(publicHex),Buffer.from(signatureHex,'hex'));
// stage-b.mjs step: sign(record) -> {signer_public_key, signature}. The signature covers the canonical record including the public key.
export function signRecord(record,privateHex){const signer_public_key=publicKeyOf(privateHex);return {signer_public_key,signature:signHex(hashJson({...record,signer_public_key}),privateHex)}}
// Builds the same record as stage-b.mjs: draft_hash is the sha256 of the exact draft text that was paid for.
export function signDraft(draftText,masumi,privateHex,changes='none'){
 if(typeof draftText!=='string')throw new Error('Draft text is required: draft_hash covers its exact bytes');
 if(!masumi?.blockchainIdentifier||!masumi?.resultHash)throw new Error('Masumi blockchainIdentifier and resultHash are required');
 const record={draft_hash:sha256(draftText),masumi_result_hash:masumi.resultHash,masumi_blockchain_identifier:masumi.blockchainIdentifier,changes};
 return {...record,...signRecord(record,privateHex)};
}
// With draftText, also checks that the record points at exactly that draft.
export function verifySignedRecord(signed,draftText){
 const {signature,...record}=signed;
 if(draftText!==undefined&&sha256(draftText)!==record.draft_hash)return false;
 try{return verifyHex(hashJson(record),signature,record.signer_public_key)}catch{return false}
}
