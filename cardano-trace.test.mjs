import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {anchorFiles,anchorIndex,writeStageB,memoryJournal} from './cardano-writes.mjs';
import {generateKey,signDraft} from './cardano-sign.mjs';
import {trace,checkTrace} from './cardano-trace.mjs';
const draftText=readFileSync('examples/demo-draft.json','utf8');
const draft=JSON.parse(draftText);
// Full run on a fake chain; read returns metadata as it comes back from the chain (JSON round trip).
async function run({anchor=true}={}){
 const txs=[];const chain={async submit(entry){txs.push(JSON.parse(JSON.stringify(entry)));return `tx${txs.length}`},async waitConfirmed(txHash){return {txHash,feeLovelace:'1'}}};
 const anchorJournal=memoryJournal();
 if(anchor)await anchorFiles([...draft.documents,...draft.cell_test_files],chain,anchorJournal);
 const signed=signDraft(draftText,{blockchainIdentifier:'m'.repeat(120),resultHash:'f'.repeat(64)},generateKey().privateKey);
 const out=await writeStageB(signed,draft,chain,{anchors:anchorIndex(anchorJournal.state),draftText});
 return {txs,signed,passportTx:out.logs['passport:NB-1'].txHash,read:async h=>txs[Number(h.slice(2))-1]??null};
}
test('trace follows the passport to every cell, donor log, and file anchor',async()=>{
 const {signed,passportTx,read}=await run();
 const t=await trace(passportTx,read);
 assert.equal(t.passport.battery,'NB-1');
 assert.deepEqual(Object.entries(t.donors).map(([name,d])=>[name,d.cells.length,d.unlinked.length]),[['pack:A',27,0],['pack:B',23,0],['pack:C',31,0]]);
 assert.deepEqual(Object.keys(t.donors['pack:A'].anchors),['tx1']);
 assert.equal(t.donors['pack:A'].anchors.tx1['packA-invoice-2021-de'],draft.documents.find(d=>d.doc_id==='packA-invoice-2021-de').sha256);
 assert.deepEqual(checkTrace(t,draftText,signed),[]);
});
test('trace check reports an edited draft, a missing back link, missing anchors, and a wrong start',async()=>{
 const {txs,signed,passportTx,read}=await run();
 const edited=JSON.stringify({...draft,events:draft.events.map(e=>e.pack_id==='A'&&e.type==='soh_measurement'?{...e,fields:{...e.fields,soh_pct:97}}:e)},null,2);
 const problems=checkTrace(await trace(passportTx,read),edited,signed);
 assert.ok(problems.includes('signed record does not verify against the draft'));
 assert.ok(problems.includes('pack:A: events root differs from the draft'));
 txs[2].entries[1].to['NB-1']=txs[2].entries[1].to['NB-1'].filter(c=>c!=='B-M3-C01');
 assert.ok(checkTrace(await trace(passportTx,read),draftText,signed).includes('B-M3-C01: pack:B log does not send it to NB-1'));
 await assert.rejects(trace('tx2',read),/not a passport/);
 const bare=await run({anchor:false});
 assert.ok(checkTrace(await trace(bare.passportTx,bare.read),draftText,bare.signed).includes('pack:A: no document anchors linked'));
});
