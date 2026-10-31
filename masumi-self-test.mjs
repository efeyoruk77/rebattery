// Paid end-to-end test through Masumi, without Sokosumi: our own buyer wallet hires our own agent on Preprod.
//   node --env-file=.env --env-file=.local/mps.env masumi-self-test.mjs start   uploads the demo batch, starts a job, pays into escrow
//   node --env-file=.env --env-file=.local/mps.env masumi-self-test.mjs watch   follows the job until the seller is paid
// Needs: npm start (agent), npm run api (agent API), the payment service, and a funded buyer wallet (test ADA + 1 test USDM).
// Real Preprod transactions: get team approval before running it.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {uploadBatch} from './upload.mjs';
import {defaultConfig} from './draft.mjs';
import {USDM} from './paid-task.mjs';
import {sellerTokenNet} from './settlement.mjs';

const STATE = '.local/masumi-self-test.json';
const MPS = (process.env.MPS_URL || 'http://127.0.0.1:38127') + '/api/v1';
const API = `http://127.0.0.1:${process.env.AGENT_API_PORT || 21950}`;
const PRICE = '1000000'; // 1 test USDM, what agent-api.mjs asks for
const scan = h => `https://preprod.cardanoscan.io/transaction/${h}`;
const save = s => writeFileSync(STATE, JSON.stringify(s, null, 2), {mode: 0o600});
const blockfrost = path => fetch(`https://cardano-preprod.blockfrost.io/api/v0${path}`, {headers: {project_id: process.env.BLOCKFROST_API_KEY_PREPROD}, signal: AbortSignal.timeout(15000)});

async function mps(path, body) {
 const r = await fetch(MPS + path, {method: body ? 'POST' : 'GET', headers: {token: process.env.ADMIN_KEY, 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000)});
 const j = await r.json();
 if (!r.ok || j.status !== 'success') throw Error(`Payment service ${path}: HTTP ${r.status} ${JSON.stringify(j.error ?? j.message ?? j).slice(0, 300)}`);
 return j.data;
}

async function balance(address) {
 const r = await blockfrost(`/addresses/${address}`);
 if (r.status === 404) return {ada: 0, usdm: 0};
 const j = await r.json();
 const unit = u => Number(j.amount.find(a => a.unit === u)?.quantity ?? 0) / 1e6;
 return {ada: unit('lovelace'), usdm: unit(USDM)};
}

async function start() {
 if (existsSync(STATE)) throw Error(`${STATE} exists: a test is already running. Run "watch", or move the file away to start a new one.`);
 const wallets = JSON.parse(readFileSync('docs/payment-state.json', 'utf8'));
 const b = await balance(wallets.purchasingAddress);
 console.log(`Buyer wallet: ${b.ada} tADA, ${b.usdm} tUSDM`);
 if (b.ada < 10 || b.usdm < 1) throw Error('Buyer wallet needs at least 10 tADA and 1 tUSDM (Masumi dispenser, with collateral).');

 const job = uploadBatch('battery/demo', defaultConfig().storeDir);
 const nonce = randomBytes(10).toString('hex');
 const startRes = await fetch(`${API}/start_job`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({identifier_from_purchaser: nonce, input_data: {job}})});
 const offer = await startRes.json();
 if (!startRes.ok) throw Error(`start_job: HTTP ${startRes.status} ${JSON.stringify(offer)}`);
 console.log(`Job ${offer.id} started; payment requested, pay by ${new Date(offer.payByTime).toLocaleTimeString()}`);
 save({nonce, jobId: offer.id, offer, startedAt: new Date().toISOString()});

 // Pay exactly what the agent's signed payment request asks for, into the escrow contract.
 const payment = await mps('/payment/resolve-blockchain-identifier', {network: 'Preprod', blockchainIdentifier: offer.blockchainIdentifier, includeHistory: 'false'});
 const amounts = payment.RequestedFunds.map(({amount, unit}) => ({amount, unit}));
 if (amounts.length !== 1 || amounts[0].unit !== USDM || amounts[0].amount !== PRICE) throw Error(`Unexpected price ${JSON.stringify(amounts)}; refusing to pay.`);
 const purchase = await mps('/purchase', {
  blockchainIdentifier: offer.blockchainIdentifier, network: 'Preprod', paymentSourceType: 'Web3CardanoV2',
  supportedPaymentSourceIndex: offer.supportedPaymentSourceIndex, inputHash: offer.input_hash,
  sellerVkey: offer.sellerVKey, agentIdentifier: offer.agentIdentifier, Amounts: amounts,
  payByTime: String(offer.payByTime), submitResultTime: String(offer.submitResultTime),
  unlockTime: String(offer.unlockTime), externalDisputeUnlockTime: String(offer.externalDisputeUnlockTime),
  identifierFromPurchaser: nonce,
 });
 save({nonce, jobId: offer.id, offer, purchaseId: purchase.id, startedAt: new Date().toISOString()});
 console.log(`Purchase ${purchase.id} requested: the buyer wallet now pays 1 tUSDM into escrow. Next: node --env-file=.env --env-file=.local/mps.env masumi-self-test.mjs watch`);
}

async function watch() {
 const s = JSON.parse(readFileSync(STATE, 'utf8'));
 const wallets = JSON.parse(readFileSync('docs/payment-state.json', 'utf8'));
 let last = '';
 for (;;) {
  const p = await mps('/payment/resolve-blockchain-identifier', {network: 'Preprod', blockchainIdentifier: s.offer.blockchainIdentifier, includeHistory: 'true'});
  const job = await (await fetch(`${API}/status?job_id=${s.jobId}`)).json().catch(() => ({}));
  const txs = [p.CurrentTransaction, ...(p.TransactionHistory || [])].filter(t => t?.txHash && t.status === 'Confirmed');
  const line = `payment ${p.onChainState ?? 'not on-chain yet'} | job ${job.status ?? '?'}`;
  if (line !== last) { console.log(`${new Date().toLocaleTimeString()}  ${line}`); last = line; }
  for (const t of txs) if (!s[`tx_${t.newOnChainState}`]) { s[`tx_${t.newOnChainState}`] = t.txHash; save(s); console.log(`   ${t.newOnChainState}: ${scan(t.txHash)}`); }
  if (['Withdrawn', 'DisputedWithdrawn'].includes(p.onChainState) && s[`tx_${p.onChainState}`]) {
   const utxos = await (await blockfrost(`/txs/${s[`tx_${p.onChainState}`]}/utxos`)).json();
   const net = sellerTokenNet(utxos, wallets.sellerAddress, USDM);
   console.log(`Seller received ${Number(net) / 1e6} tUSDM net in the payout transaction.`);
   s.sellerNetUsdm = Number(net) / 1e6; s.finishedAt = new Date().toISOString(); save(s);
   return;
  }
  if (['RefundWithdrawn', 'Disputed', 'FundsOrDatumInvalid'].includes(p.onChainState)) { console.log(`Stopped in state ${p.onChainState}. Inspect the payment service.`); return; }
  // Give up only while the result was never delivered. Once it is on-chain the seller can still collect,
  // even late (for example after the payment service was stopped), so keep waiting.
  if (p.onChainState !== 'ResultSubmitted' && Date.now() > Number(s.offer.externalDisputeUnlockTime) + 30 * 60_000) { console.log('Past every deadline without a delivered result. Inspect the payment service.'); return; }
  await new Promise(r => setTimeout(r, 30_000));
 }
}

const cmd = process.argv[2];
if (cmd === 'start') await start();
else if (cmd === 'watch') await watch();
else console.log('Usage: masumi-self-test.mjs start | watch');
