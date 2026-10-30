// Stage B: after payment, the company reviews the paid draft, signs it, and publishes it on Cardano.
// Member 3 plugs in signing and the event log writes; see docs/team-plan.md.
import {resultHash,sha256} from './standard-hash.mjs';

const notConnected = step => async () => { throw Error(`Stage B step "${step}" is not connected yet (owner: Member 3)`); };
export const defaultSteps = {
 sign: notConnected('sign'),                             // (record) -> {signer_public_key, signature}
 writeDonorLogs: notConnected('writeDonorLogs'),         // (signedRecord, draft) -> txHashes
 writeNewBatteryLog: notConnected('writeNewBatteryLog'), // (signedRecord, draft) -> txHashes
};

// Only a draft whose Masumi result hash matches can be signed: the record must point at what was paid for.
// The two paid paths hash differently: agent-api.mjs uses the nonce ('standard'), paid-task.mjs does not ('task').
export function checkPaidDraft({draftText, nonce, resultHash: paidHash, blockchainIdentifier, hashScheme = 'standard'}) {
 if (typeof draftText !== 'string' || !paidHash || !blockchainIdentifier) throw Error('Paid draft, result hash, and blockchain identifier are required');
 if (hashScheme === 'standard' && !nonce) throw Error('Standard result hash needs the purchaser nonce');
 const expected = hashScheme === 'task' ? sha256(draftText) : resultHash(draftText, nonce);
 if (expected !== paidHash) throw Error('Draft does not match the result hash submitted to Masumi');
 return JSON.parse(draftText);
}

export function createStageB(steps = {}) {
 const s = {...defaultSteps, ...steps};
 return async function finalize(paid, {changes = 'none'} = {}) {
  const draft = checkPaidDraft(paid);
  const record = {draft_hash: sha256(paid.draftText), masumi_result_hash: paid.resultHash, masumi_blockchain_identifier: paid.blockchainIdentifier, changes};
  const signedRecord = {...record, ...await s.sign(record)};
  const donorTxs = await s.writeDonorLogs(signedRecord, draft);
  const newBatteryTxs = await s.writeNewBatteryLog(signedRecord, draft);
  return {signedRecord, donorTxs, newBatteryTxs};
 };
}

export const finalize = createStageB();
