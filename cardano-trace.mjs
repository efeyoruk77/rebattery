import {unchunk,eventsRoot,metadatum,canonical,filesOf,packOf,moduleOf} from './cardano-log.mjs';
import {sha256} from './standard-hash.mjs';
import {verifySignedRecord} from './cardano-sign.mjs';
// Walks passport -> ESS log -> each donor log -> file anchors using only on-chain metadata.
// read(txHash) returns the metadata under our label, or null. Each transaction is read once.
export async function trace(passportTx,read){
 const cache=new Map(),get=tx=>{if(!cache.has(tx))cache.set(tx,read(tx));return cache.get(tx)};
 const passport=await get(passportTx);
 if(passport?.type!=='passport')throw new Error(`${passportTx} is not a passport entry`);
 const battery=await get(passport.log_tx);
 if(battery?.log!==`battery:${passport.battery}`)throw new Error(`${passport.log_tx} is not the log of ${passport.battery}`);
 const assembled=battery.entries?.find(e=>e.type==='assembled_from');
 if(!assembled)throw new Error(`${passport.log_tx} has no assembled_from entry`);
 const donors=Object.fromEntries(await Promise.all(Object.entries(assembled.donors).map(async([name,d])=>{
  const log=await get(d.tx);
  if(log?.log!==name)throw new Error(`${d.tx} is not the ${name} donor log`);
  const links=log.entries.find(e=>e.type==='events')?.anchors??[];
  const anchors=Object.fromEntries(await Promise.all(links.map(async a=>[a,await get(a)])));
  // A module is linked both ways when the donor's "disassembled" entry sends it to this ESS.
  const sent=new Set(log.entries.find(e=>e.type==='disassembled')?.to?.[passport.battery]??[]);
  return [name,{...d,log,anchors,unlinked:Object.keys(d.modules).filter(m=>!sent.has(m))}];
 })));
 return {passport:{txHash:passportTx,...passport},battery:{txHash:passport.log_tx,...battery},donors};
}
// Compares the traced chain with the off-chain draft text and signed record. Returns a list of problems; empty means it all matches.
// With companyKey, the signature must also come from the company's public key.
export function checkTrace(traced,draftText,signed,{companyKey}={}){
 const draft=JSON.parse(draftText),id=traced.passport.battery,problems=[];
 const same=(a,b)=>canonical(a)===canonical(b),asMetadata=v=>v==null?undefined:metadatum(v);
 if(!verifySignedRecord(signed,draftText))problems.push('signed record does not verify against the draft');
 if(companyKey&&signed.signer_public_key!==companyKey)problems.push('signed record is not signed with the company key');
 const expected={draft:signed.draft_hash,paid:signed.masumi_result_hash,masumi:signed.masumi_blockchain_identifier,changes:sha256(String(signed.changes)),signer:signed.signer_public_key,sig:signed.signature};
 for(const entry of [traced.battery,...Object.values(traced.donors).map(d=>d.log)])
  for(const [field,value] of Object.entries(expected))if(unchunk(entry[field])!==value)problems.push(`${entry.log}: on-chain ${field} differs from the signed record`);
 const battery=draft.new_batteries.find(b=>b.battery_id===id);
 if(!battery)return [...problems,`${id}: not in the draft`];
 // Each cell with its module and donor pack must match the draft exactly.
 const onChain=Object.entries(traced.donors).flatMap(([name,d])=>Object.entries(d.modules).flatMap(([m,cells])=>cells.map(c=>`${name.slice(5)}|${m}|${c}`))).sort();
 const inDraft=battery.cells.map(c=>`${c.donor_pack}|${c.module_id??moduleOf(c.cell_id)}|${c.cell_id}`).sort();
 if(onChain.join()!==inDraft.join())problems.push(`${id}: on-chain cells differ from the draft`);
 const assembled=traced.battery.entries.find(e=>e.type==='assembled_from');
 for(const [field,value] of [['cell_model',battery.cell_model],['chemistry',battery.chemistry],['count',battery.cells.length]])
  if(!same(assembled[field],asMetadata(value)))problems.push(`${id} ESS log: ${field} differs from the draft`);
 for(const [where,entry] of [['ESS log',assembled],['passport',traced.passport]])
  for(const [field,value] of [['health',battery.health],['facility',battery.second_life_facility]])
   if(!same(entry[field],asMetadata(value)))problems.push(`${id} ${where}: ${field} differs from the draft`);
 for(const [name,d] of Object.entries(traced.donors)){
  const pack=name.slice('pack:'.length),events=d.log.entries.find(e=>e.type==='events'),packEvents=draft.events.filter(e=>e.pack_id===pack);
  if(events?.root!==eventsRoot(packEvents)||events?.count!==packEvents.length)problems.push(`${name}: events root differs from the draft`);
  for(const m of d.unlinked)problems.push(`${m}: ${name} log does not send it to ${id}`);
  const disassembled=d.log.entries.find(e=>e.type==='disassembled'),held=(draft.held_back||[]).filter(h=>packOf(h.id)===pack);
  if(!same(disassembled?.not_taken_apart,held.filter(h=>h.level==='module').map(h=>h.id))||!same(disassembled?.unused_cells,held.filter(h=>h.level==='cell').map(h=>h.id)))problems.push(`${name}: held-back modules or cells differ from the draft`);
  // Every file of the pack must sit in one of the anchors the log links, with its draft hash.
  for(const [tx,entry] of Object.entries(d.anchors))if(!entry)problems.push(`${tx}: anchor transaction not found`);
  const anchored=new Map(Object.values(d.anchors).filter(Boolean).flatMap(a=>['docs','test','cells'].flatMap(g=>Object.entries(a[g]??{}).map(([f,h])=>[`${g}:${f}`,h]))));
  for(const f of filesOf(draft).filter(f=>f.pack===pack))if(anchored.get(`${f.group}:${f.id}`)!==f.sha256)problems.push(`${f.group}:${f.id}: not anchored with its draft hash`);
 }
 return problems;
}
