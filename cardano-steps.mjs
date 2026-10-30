// Member 3's steps for stage-b.mjs (sign, writeDonorLogs, writeNewBatteryLog) and the stage A anchor; see docs/team-plan.md.
// Real Preprod writes need CARDANO_WRITES_ENABLED=true, set only after team approval, and never run under node --test.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {signRecord} from './cardano-sign.mjs';
import {anchorFiles,anchorIndex,writeDonorLogs,writeNewBatteryLog} from './cardano-writes.mjs';
const ENV='.local/cardano.env';
export const ANCHOR_JOURNAL='.local/cardano-anchor.json';
export function fileJournal(path){
 const state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{logs:{}};
 return {state,save(next){mkdirSync('.local',{recursive:true});writeFileSync(path,JSON.stringify(next,null,1)+'\n',{mode:0o600})}};
}
// One progress file per signed draft, shared by the CLI and the review screen.
export const stageBJournal=draftHash=>fileJournal(`.local/cardano-stage-b-${draftHash.slice(0,16)}.json`);
// .env is loaded by npm scripts; wallet and company key live in .local/cardano.env, read here like paid-task reads mps-runtime.env.
export const setting=name=>process.env[name]??(existsSync(ENV)?parseEnv(readFileSync(ENV,'utf8'))[name]:undefined);
export function createCardanoSteps({chain:providedChain,key,enabled,journal=signed=>stageBJournal(signed.draft_hash),anchorJournal,read=setting}={}){
 let chain=providedChain;
 const journals=new Map();
 const journalFor=signed=>{if(!journals.has(signed.draft_hash))journals.set(signed.draft_hash,journal(signed));return journals.get(signed.draft_hash)};
 const anchors=()=>anchorJournal??fileJournal(ANCHOR_JOURNAL);
 async function getChain(){
  if(!(enabled??read('CARDANO_WRITES_ENABLED')==='true'))throw new Error('Cardano writes are disabled. Set CARDANO_WRITES_ENABLED=true in .env after team approval.');
  if(chain)return chain;
  if(process.env.NODE_TEST_CONTEXT)throw new Error('Real Cardano writes never run under node --test. Pass a fake chain.');
  const {createChain}=await import('./cardano-chain.mjs');
  return chain=await createChain({mnemonic:read('CARDANO_WALLET_MNEMONIC'),apiKey:read('BLOCKFROST_API_KEY_PREPROD')});
 }
 function companyKey(){const k=key??read('COMPANY_SIGNING_KEY');if(!k)throw new Error('COMPANY_SIGNING_KEY missing. Run: npm run cardano -- brew');return k}
 const hashes=logs=>Object.values(logs).map(t=>t.txHash);
 return {
  sign:async record=>signRecord(record,companyKey()),
  // Donor log TxHashes in pack order, as review.html lists them.
  writeDonorLogs:async(signed,draft)=>hashes(await writeDonorLogs(signed,draft,await getChain(),{journal:journalFor(signed),anchors:anchorIndex(anchors().state)})),
  // New battery log TxHash, then its passport TxHash.
  writeNewBatteryLog:async(signed,draft)=>hashes(await writeNewBatteryLog(signed,draft,await getChain(),{journal:journalFor(signed)})),
  // Stage A, for the upload step: anchors documents and cell test files and returns them with anchor_tx.
  anchor:async files=>(await anchorFiles(files,await getChain(),anchors())).files,
 };
}
