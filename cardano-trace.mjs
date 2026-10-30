import {unchunk,eventsRoot} from './cardano-log.mjs';
import {verifySignedRecord} from './cardano-sign.mjs';
// Walks passport -> battery log -> each donor log -> document anchors using only on-chain metadata.
// read(txHash) returns the metadata under our label, or null.
export async function trace(passportTx,read){
 const passport=await read(passportTx);
 if(passport?.type!=='passport')throw new Error(`${passportTx} is not a passport entry`);
 const battery=await read(passport.log_tx);
 const assembled=battery?.entries?.find(e=>e.type==='assembled_from');
 if(!assembled)throw new Error(`${passport.log_tx} has no assembled_from entry`);
 const donors={};
 for(const [name,d] of Object.entries(assembled.donors)){
  const log=await read(d.tx);
  if(log?.log!==name)throw new Error(`${d.tx} is not the ${name} donor log`);
  const anchors={};
  for(const a of log.entries.find(e=>e.type==='events')?.anchors??[])anchors[a]=(await read(a))?.docs??null;
  // A cell is linked both ways when the donor's "disassembled" entry sends it to this battery.
  const sent=new Set(log.entries.find(e=>e.type==='disassembled')?.to?.[passport.battery]??[]);
  donors[name]={...d,log,anchors,unlinked:d.cells.filter(c=>!sent.has(c))};
 }
 return {passport:{txHash:passportTx,...passport},battery:{txHash:passport.log_tx,...battery},donors};
}
// Compares the traced chain with the off-chain draft text and signed record. Returns a list of problems; empty means it all matches.
export function checkTrace(traced,draftText,signed){
 const draft=JSON.parse(draftText);const problems=[];
 if(!verifySignedRecord(signed,draftText))problems.push('signed record does not verify against the draft');
 const expected={draft:signed.draft_hash,paid:signed.masumi_result_hash,masumi:signed.masumi_blockchain_identifier,signer:signed.signer_public_key,sig:signed.signature};
 for(const entry of [traced.battery,...Object.values(traced.donors).map(d=>d.log)])
  for(const [field,value] of Object.entries(expected))if(unchunk(entry[field])!==value)problems.push(`${entry.log}: on-chain ${field} differs from the signed record`);
 const files=[...draft.documents,...(draft.cell_test_files||[])];
 for(const [name,d] of Object.entries(traced.donors)){
  const pack=name.slice('pack:'.length);
  if(d.log.entries.find(e=>e.type==='events')?.root!==eventsRoot(draft.events.filter(e=>e.pack_id===pack)))problems.push(`${name}: events root differs from the draft`);
  for(const c of d.unlinked)problems.push(`${c}: ${name} log does not send it to ${traced.passport.battery}`);
  if(d.test_file!==files.find(f=>f.file_id&&f.pack_id===pack)?.sha256)problems.push(`${name}: cell test file hash differs from the draft`);
  if(!Object.keys(d.anchors).length)problems.push(`${name}: no document anchors linked`);
  for(const [tx,docs] of Object.entries(d.anchors)){
   if(!docs){problems.push(`${tx}: anchor transaction not found`);continue}
   for(const [id,hash] of Object.entries(docs)){const f=files.find(x=>(x.doc_id??x.file_id)===id);if(f&&f.sha256!==hash)problems.push(`${id}: anchored hash differs from the draft`)}
  }
 }
 const battery=draft.new_batteries.find(b=>b.battery_id===traced.passport.battery);
 if(battery?.cells.map(c=>c.cell_id).sort().join()!==Object.values(traced.donors).flatMap(d=>d.cells).sort().join())problems.push(`${traced.passport.battery}: on-chain cell list differs from the draft`);
 return problems;
}
