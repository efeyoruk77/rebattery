import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {brewMnemonic,walletAddress,createChain,explorerUrl} from './cardano-chain.mjs';
import {generateKey,signDraft} from './cardano-sign.mjs';
import {filesOf} from './cardano-log.mjs';
import {anchorFiles,anchorIndex,writeStageB,priceRun,unpaidTest,sumFees,dropUnsent} from './cardano-writes.mjs';
import {ANCHOR_JOURNAL,fileJournal,stageBJournal,writeLock,passportsOf,setting} from './cardano-steps.mjs';
import {checkPaidDraft} from './stage-b.mjs';
import {sha256} from './standard-hash.mjs';
import {trace,checkTrace} from './cardano-trace.mjs';
const ENV='.local/cardano.env',SIGNED='.local/cardano-signed.json',MAX_TX_BYTES=16384;
const [command,...args]=process.argv.slice(2);
const text=path=>readFileSync(path,'utf8');
const json=path=>JSON.parse(text(path));
// The review screen saves {signedRecord, donorTxs, newBatteryTxs}; the CLI saves the bare record. Accept both.
const signedAt=path=>{const s=json(path);return s.signedRecord??s};
const save=(path,data)=>{mkdirSync('.local',{recursive:true});writeFileSync(path,JSON.stringify(data,null,1)+'\n',{mode:0o600});console.log(`Saved ${path}`)};
const tada=lovelace=>`${(Number(lovelace)/1e6).toFixed(6)} tADA`;
const companyKey=()=>{const key=setting('COMPANY_SIGNING_KEY');if(!key)throw new Error(`COMPANY_SIGNING_KEY missing. Run brew first or set it in ${ENV}.`);return key};
const locked=async work=>{const release=writeLock();try{return await work()}finally{release()}};
// Same check as stage-b.mjs: the draft must be the one whose result hash was paid through Masumi.
const signPaid=(draftText,masumi,changes)=>{checkPaidDraft({draftText,...masumi});save(SIGNED,signDraft(draftText,masumi,companyKey(),changes))};
const commands={
 // Creates the log wallet and the company's separate signing key. Never overwrites an existing file.
 async brew(){
  if(existsSync(ENV))throw new Error(`${ENV} already exists. Keep it; a second wallet is not needed.`);
  const mnemonic=brewMnemonic().join(' ');const company=generateKey();
  mkdirSync('.local',{recursive:true});
  writeFileSync(ENV,`CARDANO_WALLET_MNEMONIC=${mnemonic}\nCOMPANY_SIGNING_KEY=${company.privateKey}\nCOMPANY_PUBLIC_KEY=${company.publicKey}\n`,{mode:0o600});
  console.log(`Saved ${ENV} (keep it private, never commit it)\nLog wallet address (fund this on the Preprod faucet):\n${await walletAddress(mnemonic)}\nCompany public key: ${company.publicKey}`);
 },
 async status(){
  console.log(`Log wallet address: ${await walletAddress()}`);
  if(!process.env.BLOCKFROST_API_KEY_PREPROD){console.log('BLOCKFROST_API_KEY_PREPROD is not set in .env, so the balance cannot be read yet.');return}
  const chain=await createChain();const b=await chain.balance();
  console.log(`Balance: ${tada(b.lovelace)} in ${b.utxos} UTxOs. Metadata label: ${chain.label}. Review screen writes: ${process.env.CARDANO_WRITES_ENABLED==='true'?'enabled':'disabled'}`);
 },
 // Builds, signs, and prices a full run (anchors + stage B) as an unpaid test record. Sends nothing.
 async 'dry-run'(draftPath){
  const all=await priceRun(text(draftPath),await createChain(),companyKey());
  for(const [name,tx] of all)console.log(`${name.padEnd(18)} fee ${tada(tx.feeLovelace)}  size ${tx.sizeBytes} bytes`);
  console.log(`Total for ${all.length} transactions: ${tada(sumFees(all.map(([,tx])=>tx)))}. Largest: ${Math.max(...all.map(([,tx])=>tx.sizeBytes))} of ${MAX_TX_BYTES} bytes. Nothing was sent.`);
 },
 // Stage A: anchor every document and test file hash of a draft or job input, in as many transactions as needed. Resumable.
 async anchor(path){
  const files=filesOf(json(path));
  const out=await locked(async()=>anchorFiles(files,await createChain(),fileJournal(ANCHOR_JOURNAL)));
  for(const tx of out.transactions)console.log(`Anchor ${tx.txHash} fee ${tada(tx.feeLovelace)} ${explorerUrl(tx.txHash)}`);
  console.log(`${files.length} files anchored. Progress kept in ${ANCHOR_JOURNAL}`);
 },
 // Stage B part 1: the company signs the exact paid draft. masumi.json holds {blockchainIdentifier, resultHash} and nonce, or hashScheme "task".
 async sign(draftPath,masumiPath,changes='none'){signPaid(text(draftPath),json(masumiPath),changes)},
 // Stage B part 1 for a test run without payment: the on-chain record says "unpaid-test-run".
 async 'sign-test'(draftPath,changes='none'){const draftText=text(draftPath);signPaid(draftText,unpaidTest(draftText),changes)},
 // Stage B part 2: donor logs, then each ESS log and passport. Each transaction waits for its block. Resumable;
 // "resume" instead of a signed file takes the signed record kept in the draft's journal.
 async 'stage-b'(draftPath,signedPath=SIGNED){
  const draftText=text(draftPath);let journal;
  const out=await locked(async()=>{
   journal=stageBJournal(sha256(draftText));
   const signed=signedPath==='resume'?journal.state.signed_record:signedAt(signedPath);
   if(!signed)throw new Error("No signed record kept in this draft's journal. Sign first.");
   return writeStageB(signed,JSON.parse(draftText),await createChain(),{journal,anchors:anchorIndex(fileJournal(ANCHOR_JOURNAL).state),draftText});
  });
  for(const [log,tx] of Object.entries(out.logs))console.log(`${log}: ${tx.txHash} fee ${tada(tx.feeLovelace)} ${explorerUrl(tx.txHash)}`);
  console.log(`${out.transactions} transactions, total fee ${tada(out.totalFeeLovelace)}\nQR codes (passport per ESS):`);
  for(const [id,p] of Object.entries(passportsOf(journal.state)))console.log(`  ${id}: ${p.url}`);
 },
 // Follows a passport back to every donor log and file anchor. With the draft and signed record, also checks they match.
 async trace(passportTx,draftPath,signedPath=SIGNED){
  const chain=await createChain();const t=await trace(passportTx,h=>chain.readMetadata(h));
  console.log(`Passport ${t.passport.battery}: ${explorerUrl(t.passport.txHash)}\nESS log ${t.battery.log}: ${explorerUrl(t.battery.txHash)}`);
  for(const [name,d] of Object.entries(t.donors)){
   const disassembled=d.log.entries.find(e=>e.type==='disassembled');
   console.log(`Donor ${name}: ${explorerUrl(d.tx)}\n  ${Object.values(d.modules).flat().length} cells from ${Object.keys(d.modules).join(', ')}${d.unlinked.length?`; NOT linked back: ${d.unlinked.join(', ')}`:'; all linked both ways'}`);
   console.log(`  ${d.log.entries.find(e=>e.type==='events')?.count} events; not taken apart: ${disassembled?.not_taken_apart?.join(', ')||'none'}; unused cells: ${disassembled?.unused_cells?.join(', ')||'none'}`);
   const count=(entry,group)=>Object.keys(entry[group]??{}).length;
   for(const [a,entry] of Object.entries(d.anchors))console.log(`  anchor ${explorerUrl(a)}: ${entry?`${count(entry,'docs')} documents, ${count(entry,'test')} module tests, ${count(entry,'cells')} cell test batches`:'NOT FOUND'}`);
  }
  if(draftPath){const problems=checkTrace(t,text(draftPath),signedAt(signedPath),{companyKey:setting('COMPANY_PUBLIC_KEY')});console.log(problems.length?`Problems:\n- ${problems.join('\n- ')}`:'Checks: on-chain records match the draft and signed record.');if(problems.length)process.exitCode=1}
 },
 // Removes a stuck entry whose transaction the network does not know (for example its inputs were spent), so the next run rebuilds it.
 async 'drop-unsent'(journalPath,key){const txHash=await locked(async()=>dropUnsent(fileJournal(journalPath),key,await createChain()));console.log(`Removed ${key} (unsent tx ${txHash}). The next run builds a new transaction for it.`)},
 async read(txHash){console.log(JSON.stringify(await (await createChain()).readMetadata(txHash),null,1))}
};
if(!commands[command]){console.error(`Usage: npm run cardano -- <${Object.keys(commands).join('|')}> [args]`);process.exit(1)}
await commands[command](...args);
