import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {brewMnemonic,walletAddress,createChain,explorerUrl} from './cardano-chain.mjs';
import {generateKey,signDraft} from './cardano-sign.mjs';
import {anchorFiles,anchorIndex,writeStageB,dryRun,sumFees} from './cardano-writes.mjs';
import {ANCHOR_JOURNAL,fileJournal,stageBJournal} from './cardano-steps.mjs';
import {trace,checkTrace} from './cardano-trace.mjs';
const ENV='.local/cardano.env',SIGNED='.local/cardano-signed.json',MAX_TX_BYTES=16384,CELL_ID_BYTES=9;
const [command,...args]=process.argv.slice(2);
const text=path=>readFileSync(path,'utf8');
const json=path=>JSON.parse(text(path));
const save=(path,data)=>{mkdirSync('.local',{recursive:true});writeFileSync(path,JSON.stringify(data,null,1)+'\n',{mode:0o600});console.log(`Saved ${path}`)};
// Documents and cell test files of a draft or job input, or a plain list of files.
const filesOf=input=>Array.isArray(input)?input:[...(input.documents??[]),...(input.cell_test_files??[])];
const tada=lovelace=>`${(Number(lovelace)/1e6).toFixed(6)} tADA`;
const links=logs=>{for(const [log,tx] of Object.entries(logs))console.log(`${log}: ${tx.txHash} fee ${tada(tx.feeLovelace)} ${explorerUrl(tx.txHash)}`)};
const companyKey=()=>{if(!process.env.COMPANY_SIGNING_KEY)throw new Error(`COMPANY_SIGNING_KEY missing. Run brew first or set it in ${ENV}.`);return process.env.COMPANY_SIGNING_KEY};
const commands={
 // Creates the agent wallet and the company's separate signing key. Never overwrites an existing file.
 async brew(){
  if(existsSync(ENV))throw new Error(`${ENV} already exists. Keep it; a second wallet is not needed.`);
  const mnemonic=brewMnemonic().join(' ');const company=generateKey();
  mkdirSync('.local',{recursive:true});
  writeFileSync(ENV,`CARDANO_WALLET_MNEMONIC=${mnemonic}\nCOMPANY_SIGNING_KEY=${company.privateKey}\nCOMPANY_PUBLIC_KEY=${company.publicKey}\n`,{mode:0o600});
  console.log(`Saved ${ENV} (keep it private, never commit it)\nAgent wallet address (fund this on the Preprod faucet):\n${await walletAddress(mnemonic)}\nCompany public key: ${company.publicKey}`);
 },
 async status(){
  console.log(`Agent wallet address: ${await walletAddress()}`);
  if(!process.env.BLOCKFROST_API_KEY_PREPROD){console.log('BLOCKFROST_API_KEY_PREPROD is not set in .env, so the balance cannot be read yet.');return}
  const chain=await createChain();const b=await chain.balance();
  console.log(`Balance: ${tada(b.lovelace)} in ${b.utxos} UTxOs. Metadata label: ${chain.label}. Review screen writes: ${process.env.CARDANO_WRITES_ENABLED==='true'?'enabled':'disabled'}`);
 },
 // Builds, signs, and prices a full run (anchor + stage B) with dummy Masumi values. Submits nothing.
 async 'dry-run'(draftPath){
  const draftText=text(draftPath),draft=JSON.parse(draftText),chain=dryRun(await createChain());
  const anchor=await anchorFiles(filesOf(draft),chain);
  const anchors=Object.fromEntries(anchor.files.map(f=>[f.sha256,anchor.txHash]));
  const signed=signDraft(draftText,{blockchainIdentifier:'d'.repeat(200),resultHash:'f'.repeat(64)},companyKey());
  const out=await writeStageB(signed,draft,chain,{anchors,draftText});
  for(const [log,tx] of Object.entries({anchor,...out.logs}))console.log(`${log.padEnd(16)} fee ${tada(tx.feeLovelace)}  size ${tx.sizeBytes} bytes`);
  console.log(`Total for ${out.transactions+1} transactions: ${tada(sumFees([anchor,...Object.values(out.logs)]))}. Nothing was submitted.`);
  for(const b of draft.new_batteries){const tx=out.logs[`battery:${b.battery_id}`];
   console.log(`${b.battery_id}: ${b.cells.length} cells use ${tx.sizeBytes} of ${MAX_TX_BYTES} bytes; about ${b.cells.length+Math.floor((MAX_TX_BYTES-tx.sizeBytes)/CELL_ID_BYTES)} cells fit in one batch record (${CELL_ID_BYTES} bytes per cell ID).`)}
 },
 // Stage A: anchor every document and cell test file hash from a draft, a job input, or a file list. One transaction.
 async anchor(path){
  const files=filesOf(json(path));
  const out=await anchorFiles(files,await createChain(),fileJournal(ANCHOR_JOURNAL));
  console.log(`Anchored ${files.length} files in ${out.txHash} fee ${tada(out.feeLovelace)} ${explorerUrl(out.txHash)}\nProgress kept in ${ANCHOR_JOURNAL}`);
 },
 // Stage B part 1: the company signs the exact draft text with its own key. masumi.json holds {blockchainIdentifier, resultHash}.
 async sign(draftPath,masumiPath,changes='none'){save(SIGNED,signDraft(text(draftPath),json(masumiPath),companyKey(),changes))},
 // Stage B part 2: donor logs, new battery log, passport. Each transaction waits for confirmation. Resumable.
 async 'stage-b'(draftPath,signedPath=SIGNED){
  const draftText=text(draftPath),signed=json(signedPath);
  const out=await writeStageB(signed,JSON.parse(draftText),await createChain(),{journal:stageBJournal(signed.draft_hash),anchors:anchorIndex(fileJournal(ANCHOR_JOURNAL).state),draftText});
  links(out.logs);
  console.log(`${out.transactions} transactions, total fee ${tada(out.totalFeeLovelace)}`);
 },
 // Follows a passport back to every donor log and document anchor. With the draft and signed record, also checks they match.
 async trace(passportTx,draftPath,signedPath=SIGNED){
  const chain=await createChain();const t=await trace(passportTx,h=>chain.readMetadata(h));
  console.log(`Passport ${t.passport.battery}: ${explorerUrl(t.passport.txHash)}\nBattery log ${t.battery.log}: ${explorerUrl(t.battery.txHash)}`);
  for(const [name,d] of Object.entries(t.donors)){
   const held=d.log.entries.find(e=>e.type==='disassembled')?.held??[];
   console.log(`Donor ${name}: ${explorerUrl(d.tx)}\n  ${d.cells.length} cells to ${t.passport.battery}${d.unlinked.length?`, NOT linked back: ${d.unlinked.join(', ')}`:', all linked both ways'}; held back: ${held.join(', ')||'none'}`);
   console.log(`  ${d.log.entries.find(e=>e.type==='events')?.count} events`);
   for(const [a,docs] of Object.entries(d.anchors))console.log(`  files anchored in ${explorerUrl(a)}: ${docs?Object.keys(docs).join(', '):'NOT FOUND'}`);
  }
  if(draftPath){const problems=checkTrace(t,text(draftPath),json(signedPath));console.log(problems.length?`Problems:\n- ${problems.join('\n- ')}`:'Checks: on-chain records match the draft and signed record.');if(problems.length)process.exitCode=1}
 },
 async read(txHash){console.log(JSON.stringify(await (await createChain()).readMetadata(txHash),null,1))}
};
if(!commands[command]){console.error(`Usage: npm run cardano -- <${Object.keys(commands).join('|')}> [args]`);process.exit(1)}
await commands[command](...args);
