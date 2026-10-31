import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymentTxs} from './status.mjs';

const h = c => c.repeat(64);
test('a paid task shows its confirmed escrow, result, and payout transactions', () => {
 const observed = {CurrentTransaction: {status: 'Confirmed', newOnChainState: 'ResultSubmitted', txHash: h('b')},
  TransactionHistory: [{status: 'Confirmed', newOnChainState: 'FundsLocked', txHash: h('a')}, {status: 'Pending', newOnChainState: 'Withdrawn', txHash: h('c')}]};
 // A pending payout is not shown; the payout the settlement check verified is.
 assert.deepEqual(paymentTxs(observed, null), {result: h('b'), escrow: h('a')});
 assert.deepEqual(paymentTxs(observed, {verified: true, txHash: h('d')}), {result: h('b'), escrow: h('a'), payout: h('d')});
 assert.deepEqual(paymentTxs(undefined, {verified: false, txHash: h('d')}), {});
});
