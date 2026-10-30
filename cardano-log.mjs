import {sha256} from './standard-hash.mjs';
// Project metadata label. The DPP blueprint says: pick a new integer label, never 721. Team decides the final value.
export const LABEL=1984;
export const explorerUrl=txHash=>`https://preprod.cardanoscan.io/transaction/${txHash}`;
// Canonical JSON: sorted keys, no whitespace, undefined dropped. Same object always hashes the same.
// Kept apart from battery/canonical.mjs so on-chain roots stay reproducible whatever happens to that file.
export function canonical(value){
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
export const hashJson=value=>sha256(canonical(value));
// Flat commitment over a set of events. Order-independent; verify by recomputing from the off-chain events.
export const eventsRoot=events=>sha256(events.map(hashJson).sort().join(''));
// Cardano metadata text holds at most 64 UTF-8 bytes. Longer text becomes a list of pieces, split between characters.
export function chunk64(text){
 const out=[];let piece='';
 for(const ch of text){if(Buffer.byteLength(piece+ch,'utf8')>64){out.push(piece);piece=''}piece+=ch}
 out.push(piece);return out;
}
const text64=text=>Buffer.byteLength(text,'utf8')>64?chunk64(text):text;
export const unchunk=value=>Array.isArray(value)?value.join(''):value;
// Draft values that metadata cannot hold: decimals and booleans become text, null is dropped, long text is split.
export function metadatum(value){
 if(typeof value==='string')return text64(value);
 if(typeof value==='number')return Number.isSafeInteger(value)?value:String(value);
 if(typeof value==='boolean')return String(value);
 if(Array.isArray(value))return value.filter(v=>v!==null&&v!==undefined).map(metadatum);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>[k,metadatum(v)]));
 throw new Error(`Value ${value} cannot be written as metadata`);
}
// Metadata allows only int, text (<=64 bytes), list, and map (keys <=64 bytes). No null, boolean, or decimal.
export function assertMetadatum(value,path='metadata'){
 if(typeof value==='string'){if(Buffer.byteLength(value,'utf8')>64)throw new Error(`${path} exceeds 64 bytes`);return}
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw new Error(`${path} is not a safe integer`);return}
 if(Array.isArray(value)){value.forEach((v,i)=>assertMetadatum(v,`${path}[${i}]`));return}
 if(value&&typeof value==='object'){for(const k of Object.keys(value)){if(Buffer.byteLength(k,'utf8')>64)throw new Error(`${path} key ${k} exceeds 64 bytes`);assertMetadatum(value[k],`${path}.${k}`)}return}
 throw new Error(`${path} has unsupported metadata type ${value===null?'null':typeof value}`);
}
// A transaction holds at most 16,384 bytes. Canonical JSON is longer than the CBOR it becomes, so this leaves room for inputs, outputs, and the witness.
export const MAX_ENTRY_BYTES=14000;
function checked(entry){
 assertMetadatum(entry);
 const size=Buffer.byteLength(canonical(entry),'utf8');
 if(size>MAX_ENTRY_BYTES)throw new Error(`${entry.log??entry.type} entry is ${size} bytes, too large for one transaction`);
 return entry;
}
// Mesh's Blockfrost provider throws JSON strings that can include request details. Turn anything thrown into an Error without the secret.
export function cleanError(error,secret){
 let text=error instanceof Error?error.message:error;
 if(typeof text!=='string')try{text=JSON.stringify(text)}catch{text=String(text)}
 text=String(text);
 return new Error((secret?text.split(secret).join('[redacted]'):text).slice(0,1000));
}
const present=obj=>Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==undefined&&v!==null));
export const packOf=id=>id.split('-')[0];
export const moduleOf=cellId=>cellId.split('-').slice(0,2).join('-');
// Every uploaded file of a draft or job input, grouped the way battery/ingest.mjs stores them:
// documents by doc_id, module tests ("test") and cell test batches ("cells") by module_id.
export function filesOf(input){
 const tests=input.test_files??input;
 return [...(input.documents??[]).map(d=>({group:'docs',id:d.doc_id,pack:d.pack_id,sha256:d.sha256,anchor_tx:d.anchor_tx})),
  ...(tests.module_tests??[]).map(t=>({group:'test',id:t.module_id,pack:packOf(t.module_id),sha256:t.sha256})),
  ...(tests.cell_tests??[]).map(t=>({group:'cells',id:t.module_id,pack:packOf(t.module_id),sha256:t.sha256}))];
}
// Anchor transaction of a file: its draft anchor_tx, or an anchor journal entry for the same file id with the same hash.
export const anchoredTx=(index,f)=>f.anchor_tx??(index[`${f.group}:${f.id}`]?.sha256===f.sha256?index[`${f.group}:${f.id}`].tx:undefined);
// Stage A: anchor entries for every file, split so each stays well inside one transaction. A file listed twice is an error.
export function anchorEntries(files,maxBytes=10000){
 const seen=new Set(),entries=[];let entry,size=0;
 for(const f of files){
  const key=`${f.group}:${f.id}`;
  if(!f.id||Buffer.byteLength(f.id,'utf8')>64)throw new Error(`File id ${key} is missing or longer than 64 bytes`);
  if(!/^[0-9a-f]{64}$/.test(f.sha256??''))throw new Error(`File ${key} has no sha256`);
  if(seen.has(key))throw new Error(`File ${key} is listed twice`);
  seen.add(key);
  const bytes=Buffer.byteLength(f.id,'utf8')+72;
  if(!entry||size+bytes>maxBytes){entry={v:1,type:'anchor'};entries.push(entry);size=0}
  (entry[f.group]??={})[f.id]=f.sha256;size+=bytes;
 }
 return entries.map(checked);
}
// Fields shared by every stage B entry: which draft, which payment, who signed, and the signature.
// changes is free text that may hold personal data, so only its hash goes on-chain.
const signedFields=signed=>({draft:signed.draft_hash,paid:text64(signed.masumi_result_hash),masumi:text64(signed.masumi_blockchain_identifier),
 changes:sha256(String(signed.changes)),signer:signed.signer_public_key,sig:text64(signed.signature)});
const batch=(log,index,prev,entries,signed)=>checked({v:1,log,index,...(prev?{prev}:{}),entries,...signedFields(signed)});
// Donor log batch: the pack's verified events as one root, with the anchors of its files, then "disassembled":
// which module's cells went to which ESS, which modules were not taken apart, and which cells were not used.
export function donorLogEntry(packId,draft,signed,{prev,index=0,anchorIndex={}}={}){
 const events=draft.events.filter(e=>e.pack_id===packId);
 const anchors=[...new Set(filesOf(draft).filter(f=>f.pack===packId).map(f=>anchoredTx(anchorIndex,f)).filter(Boolean))];
 const to={};
 for(const b of draft.new_batteries||[]){
  const modules=[...new Set(b.cells.filter(c=>c.donor_pack===packId).map(c=>c.module_id??moduleOf(c.cell_id)))];
  if(modules.length)to[b.battery_id]=modules;
 }
 const held=(draft.held_back||[]).filter(h=>packOf(h.id)===packId);
 return batch(`pack:${packId}`,index,prev,[{type:'events',root:eventsRoot(events),count:events.length,...(anchors.length?{anchors}:{})},
  {type:'disassembled',to,not_taken_apart:held.filter(h=>h.level==='module').map(h=>h.id),unused_cells:held.filter(h=>h.level==='cell').map(h=>h.id)}],signed);
}
// ESS log: "assembled from" lists each cell under its module and donor pack, with the donor log's transaction,
// and records the ESS's health and second-life facility.
export function essEntry(battery,draft,signed,donorTx){
 const donors={};
 for(const c of battery.cells){
  const log=`pack:${c.donor_pack}`;
  if(!donorTx[log])throw new Error(`No donor log transaction for pack ${c.donor_pack}`);
  ((donors[log]??={tx:donorTx[log],modules:{}}).modules[c.module_id??moduleOf(c.cell_id)]??=[]).push(c.cell_id);
 }
 return batch(`battery:${battery.battery_id}`,0,null,[present({type:'assembled_from',cell_model:battery.cell_model&&metadatum(battery.cell_model),chemistry:battery.chemistry&&metadatum(battery.chemistry),count:battery.cells.length,donors,
  health:battery.health&&metadatum(battery.health),facility:battery.second_life_facility&&metadatum(battery.second_life_facility)})],signed);
}
// Passport: what the ESS's QR code opens. Points at the ESS log and repeats what the QR card shows.
export function passportEntry(battery,logTx){
 return checked(present({v:1,type:'passport',battery:battery.battery_id,log_tx:logTx,
  health:battery.health&&metadatum(battery.health),facility:battery.second_life_facility&&metadatum(battery.second_life_facility)}));
}
