import {anchorEntries,anchoredTx,filesOf,donorLogEntry,essEntry,passportEntry,hashJson} from './cardano-log.mjs';
import {verifySignedRecord,signDraft} from './cardano-sign.mjs';
import {sha256} from './standard-hash.mjs';
// Journal {state:{logs},save}: the record of every transaction this project sent, saved before each next step.
export const memoryJournal=()=>({state:{logs:{}},save(){}});
async function record(journal,key,value){journal.state.logs[key]=value;await journal.save(journal.state);return value}
// One write: build and sign first (a failure there sent nothing, so nothing is saved), save the signed transaction as
// submit-pending, send it, save submitted, wait for its block, save confirmed. A rerun only resends that same signed
// transaction, which can land at most once; it never builds a second transaction for the same key.
async function write(chain,entry,key,journal){
 let prior=journal.state.logs[key];
 if(prior?.stage==='confirmed')return prior;
 if(!prior?.txHash){const tx=await chain.prepare(entry);prior=await record(journal,key,{stage:'submit-pending',txHash:tx.txHash,signedTx:tx.signedTx,entry})}
 // A sent transaction the network no longer knows (dropped from the mempool) is sent again.
 else if(prior.stage==='submitted'&&!await chain.status(prior.txHash))prior=await record(journal,key,{...prior,stage:'submit-pending'});
 if(prior.stage==='submit-pending'){
  if(!await chain.status(prior.txHash))await chain.send(prior.signedTx).catch(e=>{throw new Error(`Sending ${key} (tx ${prior.txHash}) failed: ${e.message} Rerun to resend the same transaction; it cannot land twice. If it can never land (its inputs were spent), run: npm run cardano -- drop-unsent <journal> ${key}`)});
  prior=await record(journal,key,{...prior,stage:'submitted'});
 }
 const receipt=await chain.waitConfirmed(prior.txHash);
 return record(journal,key,{stage:'confirmed',txHash:prior.txHash,feeLovelace:receipt.feeLovelace,sizeBytes:receipt.sizeBytes,entry:prior.entry});
}
// A journal belongs to one signed record, kept in full so a run can be resumed even if the signed file is lost.
// Mixing two (another changes text or key) would put logs with different signatures on-chain.
function open(journal,signed){
 journal.state.logs??={};
 if(signed){
  const id=hashJson(signed);
  if(journal.state.signed&&journal.state.signed!==id)throw new Error('This journal belongs to another signed record (different draft, changes text, or key). Finish that run with the same signed record (npm run cardano -- stage-b <draft> resume); logs already on-chain cannot change.');
  journal.state.signed=id;journal.state.signed_record=signed;
 }
 return journal;
}
// "group:id" -> {sha256, tx} for every file in confirmed anchors of an anchor journal.
export const anchorIndex=state=>Object.fromEntries(Object.values(state?.logs??{}).filter(l=>l.stage==='confirmed'&&l.entry?.type==='anchor')
 .flatMap(l=>['docs','test','cells'].flatMap(g=>Object.entries(l.entry[g]??{}).map(([id,sha256])=>[`${g}:${id}`,{sha256,tx:l.txHash}]))));
// Stage A: anchors the files not yet anchored with the same id and hash, in as many transactions as their size needs.
export async function anchorFiles(files,chain,journal=memoryJournal()){
 open(journal);anchorEntries(files);
 const todo=files.filter(f=>!anchoredTx(anchorIndex(journal.state),f));
 const transactions=[];
 for(const entry of todo.length?anchorEntries(todo):[])transactions.push(await write(chain,entry,`anchor:${hashJson(entry).slice(0,16)}`,journal));
 const index=anchorIndex(journal.state);
 return {transactions,files:files.map(f=>({...f,anchor_tx:anchoredTx(index,f)}))};
}
// stage-b.mjs has already matched the draft text to the paid hash; other callers pass draftText so it is checked here.
function checkSigned(signed,draftText){if(!verifySignedRecord(signed,draftText))throw new Error('Signed record does not match the draft or its signature is invalid')}
// Logs cannot change later, so nothing is sent until every file is anchored and every entry of the run is valid.
function checkRun(signed,draft,anchors){
 const missing=filesOf(draft).filter(f=>!anchoredTx(anchors,f)).map(f=>`${f.group}:${f.id}`);
 if(missing.length)throw new Error(`Not anchored yet: ${missing.slice(0,5).join(', ')}${missing.length>5?` and ${missing.length-5} more`:''}. Run the anchor step first.`);
 const placeholder='0'.repeat(64),donorTx=Object.fromEntries(draft.packs.map(p=>[`pack:${p}`,placeholder]));
 for(const pack of draft.packs)donorLogEntry(pack,draft,signed,{anchorIndex:anchors});
 for(const battery of draft.new_batteries){essEntry(battery,draft,signed,donorTx);passportEntry(battery,placeholder)}
}
// One transaction per donor pack.
export async function writeDonorLogs(signed,draft,chain,{journal=memoryJournal(),anchors={},draftText}={}){
 checkSigned(signed,draftText);open(journal,signed);checkRun(signed,draft,anchors);
 const logs={};
 for(const pack of draft.packs){const log=`pack:${pack}`;logs[log]=await write(chain,donorLogEntry(pack,draft,signed,{anchorIndex:anchors}),log,journal)}
 return logs;
}
// One ESS log and one passport per ESS. Donor log transactions come from the journal, so this runs after writeDonorLogs.
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
  logs[log]=await write(chain,essEntry(battery,draft,signed,donorTx),log,journal);
  logs[passport]=await write(chain,passportEntry(battery,logs[log].txHash),passport,journal);
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
// Removes a stuck entry whose transaction the network does not know, so the next run builds a new one.
export async function dropUnsent(journal,key,chain){
 const l=journal.state.logs?.[key];
 if(!l||!['submit-pending','submitted'].includes(l.stage))throw new Error(`${key} is not waiting to be sent`);
 if(await chain.status(l.txHash))throw new Error(`${key} (tx ${l.txHash}) is known to the network; it must not be replaced`);
 delete journal.state.logs[key];await journal.save(journal.state);
 return l.txHash;
}
// A test run without payment says so on-chain: masumi is "unpaid-test-run" and the result hash is the draft's own hash.
export const unpaidTest=draftText=>({blockchainIdentifier:'unpaid-test-run',resultHash:sha256(draftText),hashScheme:'task'});
// Prices a whole run (anchors, then stage B as an unpaid test record) through the same code as a real run, sending nothing.
export async function priceRun(draftText,chain,privateKey){
 const draft=JSON.parse(draftText),priced=dryRun(chain),anchorJournal=memoryJournal();
 const anchor=await anchorFiles(filesOf(draft),priced,anchorJournal);
 const out=await writeStageB(signDraft(draftText,unpaidTest(draftText),privateKey),draft,priced,{anchors:anchorIndex(anchorJournal.state),draftText});
 return [...anchor.transactions.map((tx,i)=>[`anchor ${i+1}`,tx]),...Object.entries(out.logs)];
}
// Builds, signs, and prices every write without sending anything.
export function dryRun(chain){
 const built=new Map();
 return {async prepare(entry){const tx=await chain.prepare(entry);built.set(tx.txHash,tx);return tx},
  async status(){return null},async send(){},
  async waitConfirmed(txHash){const {feeLovelace,sizeBytes}=built.get(txHash);return {txHash,feeLovelace,sizeBytes}}};
}
