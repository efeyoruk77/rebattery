import {createHash} from 'node:crypto';
// Project metadata label. The DPP blueprint says: pick a new integer label, never 721. Team decides the final value.
export const LABEL=1984;
export const sha256hex=data=>createHash('sha256').update(data).digest('hex');
// Canonical JSON: sorted keys, no whitespace, undefined dropped. Same object always hashes the same.
export function canonical(value){
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
 return JSON.stringify(value);
}
export const hashJson=value=>sha256hex(canonical(value));
// Flat commitment over a set of events. Order-independent; verify by recomputing from the off-chain events.
export const eventsRoot=events=>sha256hex(events.map(hashJson).sort().join(''));
// Cardano metadata strings hold at most 64 bytes. Longer values are written as a list of pieces.
export const chunk64=text=>{const out=[];for(let i=0;i<text.length;i+=64)out.push(text.slice(i,i+64));return out};
export const unchunk=value=>Array.isArray(value)?value.join(''):value;
// Metadata allows only int, text (<=64 bytes), list, and map (keys <=64 bytes). No null, boolean, or float.
export function assertMetadatum(value,path='metadata'){
 if(typeof value==='string'){if(Buffer.byteLength(value,'utf8')>64)throw new Error(`${path} exceeds 64 bytes`);return}
 if(typeof value==='number'){if(!Number.isInteger(value))throw new Error(`${path} is not an integer`);return}
 if(Array.isArray(value)){value.forEach((v,i)=>assertMetadatum(v,`${path}[${i}]`));return}
 if(value&&typeof value==='object'){for(const k of Object.keys(value)){if(Buffer.byteLength(k,'utf8')>64)throw new Error(`${path} key ${k} exceeds 64 bytes`);assertMetadatum(value[k],`${path}.${k}`)}return}
 throw new Error(`${path} has unsupported metadata type ${value===null?'null':typeof value}`);
}
const present=obj=>Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==undefined&&v!==null));
const packOf=cellId=>cellId.split('-')[0];
// Stage A: one transaction anchors every uploaded file's hash (documents and cell test files) before hiring.
export function anchorEntry(files){
 const docs={};
 for(const f of files){const id=f.doc_id??f.file_id;if(!id||!/^[0-9a-f]{64}$/.test(f.sha256??''))throw new Error(`File ${id} has no sha256`);docs[id]=f.sha256}
 const entry={v:1,type:'anchor',docs};assertMetadatum(entry);return entry;
}
// Fields shared by every stage B entry: who signed, which draft, which Masumi payment.
const signedFields=signed=>({draft:signed.draft_hash,paid:signed.masumi_result_hash,masumi:chunk64(signed.masumi_blockchain_identifier),signer:signed.signer_public_key,sig:chunk64(signed.signature)});
const batch=(log,index,prev,entries,signed)=>{const entry={v:1,log,index,...(prev?{prev}:{}),entries,...signedFields(signed)};assertMetadatum(entry);return entry};
// Anchor transactions of the pack's files: anchor_tx from the draft, else the anchor journal's sha256 -> tx index.
const packAnchors=(packId,draft,anchorIndex)=>[...new Set([...(draft.documents||[]),...(draft.cell_test_files||[])]
 .filter(f=>f.pack_id===packId).map(f=>f.anchor_tx??anchorIndex[f.sha256]).filter(Boolean))];
// Donor log batch: the pack's verified events as one root, then "disassembled": which cells went to which new battery, which were held back.
export function donorLogEntry(packId,draft,signed,{prev,index=0,anchorIndex={}}={}){
 const events=draft.events.filter(e=>e.pack_id===packId);
 const anchors=packAnchors(packId,draft,anchorIndex);
 const to={},held=[];
 for(const b of draft.new_batteries||[]){
  const cells=b.cells.filter(c=>c.donor_pack===packId).map(c=>c.cell_id);
  if(cells.length)to[b.battery_id]=cells;
  for(const h of b.held_back||[])if(packOf(h.cell_id)===packId&&!held.includes(h.cell_id))held.push(h.cell_id);
 }
 return batch(`pack:${packId}`,index,prev,[{type:'events',root:eventsRoot(events),count:events.length,...(anchors.length?{anchors}:{})},{type:'disassembled',to,held}],signed);
}
// New battery log: one batch listing the cells per donor pack, with the donor's log transaction and its cell test file hash.
export function newBatteryEntry(battery,draft,signed,donorTx){
 const donors={};
 for(const c of battery.cells){
  const log=`pack:${c.donor_pack}`;
  if(!donorTx[log])throw new Error(`No donor log transaction for pack ${c.donor_pack}`);
  donors[log]??=present({tx:donorTx[log],test_file:(draft.cell_test_files||[]).find(f=>f.pack_id===c.donor_pack)?.sha256,cells:[]});
  donors[log].cells.push(c.cell_id);
 }
 return batch(`battery:${battery.battery_id}`,0,null,[present({type:'assembled_from',cell_model:battery.cell_model,chemistry:battery.chemistry,count:battery.cells.length,donors})],signed);
}
// Passport record: points at the new battery's log head. Following assembled_from reaches every donor log.
export function passportEntry(batteryId,logTx){const entry={v:1,type:'passport',battery:batteryId,log_tx:logTx};assertMetadatum(entry);return entry}
