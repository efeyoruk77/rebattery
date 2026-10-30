// Member 3's steps for stage-b.mjs (sign, writeDonorLogs, writeNewBatteryLog), the stage A anchor, and the passports for the QR code.
// Real Preprod writes need CARDANO_WRITES_ENABLED=true, set only after team approval, and never run under node --test.
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {parseEnv} from 'node:util';
import {acquireWorkerLock} from './worker-lock.mjs';
import {signRecord} from './cardano-sign.mjs';
import {filesOf,explorerUrl} from './cardano-log.mjs';
import {anchorFiles,anchorIndex,writeDonorLogs,writeNewBatteryLog} from './cardano-writes.mjs';
const ENV='.local/cardano.env';
export const ANCHOR_JOURNAL='.local/cardano-anchor.json';
// The journal is the only record of sent transactions: write a temp file and rename it, so a crash never leaves half a file.
export function fileJournal(path){
 const state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{logs:{}};
 return {state,save(next){mkdirSync(dirname(path),{recursive:true});writeFileSync(`${path}.tmp`,JSON.stringify(next,null,1)+'\n',{mode:0o600});renameSync(`${path}.tmp`,path)}};
}
// One progress file per signed draft, shared by the CLI and the review screen.
export const stageBJournal=draftHash=>fileJournal(`.local/cardano-stage-b-${draftHash.slice(0,16)}.json`);
// One writer at a time across the review server and the CLI: a second Sign click or CLI run is refused, not queued.
export function writeLock(path='.local/cardano-writes.lock'){try{return acquireWorkerLock(path)}catch(e){throw new Error(`Another Cardano write is running. ${e.message}`)}}
// .env is loaded by npm scripts; wallet and company key live in .local/cardano.env, read here like paid-task reads mps-runtime.env.
export const setting=name=>process.env[name]??(existsSync(ENV)?parseEnv(readFileSync(ENV,'utf8'))[name]:undefined);
// Confirmed passports of a journal: ESS id -> {txHash, url}. The URL is what each ESS's QR code opens.
export const passportsOf=state=>Object.fromEntries(Object.entries(state?.logs??{}).filter(([k,l])=>k.startsWith('passport:')&&l.stage==='confirmed')
 .map(([k,l])=>[k.slice('passport:'.length),{txHash:l.txHash,url:explorerUrl(l.txHash)}]));
export function createCardanoSteps({chain:providedChain,key,enabled,journal=signed=>stageBJournal(signed.draft_hash),anchorJournal=()=>fileJournal(ANCHOR_JOURNAL),lock=writeLock,read=setting}={}){
 let chain=providedChain;
 async function getChain(){
  if(!(enabled??read('CARDANO_WRITES_ENABLED')==='true'))throw new Error('Cardano writes are disabled. Set CARDANO_WRITES_ENABLED=true in .env after team approval.');
  if(chain)return chain;
  if(process.env.NODE_TEST_CONTEXT)throw new Error('Real Cardano writes never run under node --test. Pass a fake chain.');
  const {createChain}=await import('./cardano-chain.mjs');
  return chain=await createChain({mnemonic:read('CARDANO_WALLET_MNEMONIC'),apiKey:read('BLOCKFROST_API_KEY_PREPROD')});
 }
 function companyKey(){const k=key??read('COMPANY_SIGNING_KEY');if(!k)throw new Error('COMPANY_SIGNING_KEY missing. Run: npm run cardano -- brew');return k}
 // Journals are read again for every step, so progress made by the CLI in the meantime is never overwritten.
 async function locked(work){const release=lock();try{return await work()}finally{release()}}
 const hashes=logs=>Object.values(logs).map(t=>t.txHash);
 return {
  sign:async record=>signRecord(record,companyKey()),
  // Donor log TxHashes in pack order, as review.html lists them.
  writeDonorLogs:(signed,draft)=>locked(async()=>hashes(await writeDonorLogs(signed,draft,await getChain(),{journal:journal(signed),anchors:anchorIndex(anchorJournal().state)}))),
  // Per ESS: its log TxHash, then its passport TxHash.
  writeNewBatteryLog:(signed,draft)=>locked(async()=>hashes(await writeNewBatteryLog(signed,draft,await getChain(),{journal:journal(signed)}))),
  // Stage A, for the upload step: anchors the documents and test files of a job input or draft, returns them with anchor_tx.
  anchor:input=>locked(async()=>(await anchorFiles(filesOf(input),await getChain(),anchorJournal())).files),
  passports:signed=>passportsOf(journal(signed).state),
 };
}
