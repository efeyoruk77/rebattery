import {anchorEntry,donorLogEntry,newBatteryEntry,passportEntry,hashJson,sha256hex} from './cardano-log.mjs';
import {verifySignedRecord} from './cardano-sign.mjs';
// Journal {state:{logs},save}: each write moves submit-pending -> submitted -> confirmed and is saved before the next step,
// so a rerun resumes instead of writing a duplicate. Like paid-task, an uncertain submit is never retried automatically.
export const memoryJournal=()=>({state:{logs:{}},save(){}});
async function record(journal,key,value){journal.state.logs[key]=value;await journal.save(journal.state);return value}
async function write(chain,entry,key,journal){
 const prior=journal.state.logs[key];
 if(prior?.stage==='confirmed')return prior;
 if(prior?.stage==='submit-pending')throw new Error(`Uncertain submit for ${key}. Check the wallet's transactions on an explorer before recovery; automatic retry disabled.`);
 let txHash=prior?.txHash;
 if(!txHash){await record(journal,key,{stage:'submit-pending'});txHash=await chain.submit(entry);await record(journal,key,{stage:'submitted',txHash,entry})}
 const receipt=await chain.waitConfirmed(txHash);
 return record(journal,key,{stage:'confirmed',txHash,feeLovelace:receipt.feeLovelace,sizeBytes:receipt.sizeBytes,entry:prior?.entry??entry});
}
function open(journal,signed){
 journal.state.logs??={};
 if(signed){
  if(journal.state.draft_hash&&journal.state.draft_hash!==signed.draft_hash)throw new Error('Journal belongs to another signed draft. Move it aside before writing a new one.');
  journal.state.draft_hash=signed.draft_hash;
 }
 return journal;
}
// Stage A: one transaction for every uploaded file (documents and cell test files). Returns the files with anchor_tx filled.
export async function anchorFiles(files,chain,journal=memoryJournal()){
 const entry=anchorEntry(files);
 const tx=await write(chain,entry,`anchor:${hashJson(entry.docs).slice(0,16)}`,open(journal));
 return {...tx,files:files.map(f=>({...f,anchor_tx:tx.txHash}))};
}
// sha256 -> anchor transaction, from an anchor journal. Links donor logs to anchors when the draft's anchor_tx is null.
export const anchorIndex=state=>Object.fromEntries(Object.values(state?.logs??{}).filter(l=>l.stage==='confirmed'&&l.entry?.type==='anchor').flatMap(l=>Object.values(l.entry.docs).map(h=>[h,l.txHash])));
// stage-b.mjs has already matched the draft text to the paid hash; other callers pass draftText so it is checked here.
function checkSigned(signed,draftText){if(!verifySignedRecord(signed,draftText))throw new Error('Signed record does not match the draft or its signature is invalid')}
// One transaction per donor pack.
export async function writeDonorLogs(signed,draft,chain,{journal=memoryJournal(),anchors={},draftText}={}){
 checkSigned(signed,draftText);open(journal,signed);
 const logs={};
 for(const pack of draft.packs){const log=`pack:${pack}`;logs[log]=await write(chain,donorLogEntry(pack,draft,signed,{anchorIndex:anchors}),log,journal)}
 return logs;
}
// New battery log, then its passport. Donor log transactions come from the journal, so this runs after writeDonorLogs.
export async function writeNewBatteryLog(signed,draft,chain,{journal=memoryJournal(),draftText}={}){
 checkSigned(signed,draftText);open(journal,signed);
 const donorTx={};
 for(const pack of draft.packs){
  const l=journal.state.logs[`pack:${pack}`];
  if(l?.stage!=='confirmed')throw new Error(`Donor log pack:${pack} is not confirmed. Write the donor logs first.`);
  donorTx[`pack:${pack}`]=l.txHash;
 }
 const logs={};
 for(const battery of draft.new_batteries){
  const log=`battery:${battery.battery_id}`,passport=`passport:${battery.battery_id}`;
  logs[log]=await write(chain,newBatteryEntry(battery,draft,signed,donorTx),log,journal);
  logs[passport]=await write(chain,passportEntry(battery.battery_id,logs[log].txHash),passport,journal);
 }
 return logs;
}
// Full stage B. Costs are summed so task 8 (measure the real cost) reads straight off the result.
export async function writeStageB(signed,draft,chain,{journal=memoryJournal(),anchors,draftText}={}){
 const donors=await writeDonorLogs(signed,draft,chain,{journal,anchors,draftText});
 const batteries=await writeNewBatteryLog(signed,draft,chain,{journal,draftText});
 const all={...donors,...batteries};
 return {logs:all,transactions:Object.keys(all).length,totalFeeLovelace:sumFees(Object.values(all))};
}
export const sumFees=txs=>txs.reduce((n,tx)=>n+BigInt(tx.feeLovelace||0),0n).toString();
// Builds and prices every write without submitting. Fake 64-hex hashes keep later entries at their real size.
export function dryRun(chain){
 let n=0;const built=new Map();
 return {async submit(entry){const {feeLovelace,sizeBytes}=await chain.build(entry);const txHash=sha256hex(`dry-run-${++n}`);built.set(txHash,{feeLovelace,sizeBytes});return txHash},
  async waitConfirmed(txHash){return {txHash,...built.get(txHash)}}};
}
