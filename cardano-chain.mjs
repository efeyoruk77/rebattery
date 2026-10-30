import {BlockfrostProvider,MeshWallet,MeshTxBuilder} from '@meshsdk/core';
import {LABEL} from './cardano-log.mjs';
const BLOCKFROST='https://cardano-preprod.blockfrost.io/api/v0';
export const explorerUrl=txHash=>`https://preprod.cardanoscan.io/transaction/${txHash}`;
const words=mnemonic=>{const w=(mnemonic||'').trim().split(/\s+/);if(w.length!==24)throw new Error('CARDANO_WALLET_MNEMONIC must hold 24 words');return w};
export const brewMnemonic=()=>MeshWallet.brew();
// Address derivation needs no network. Used by the CLI before Blockfrost is configured.
export async function walletAddress(mnemonic=process.env.CARDANO_WALLET_MNEMONIC){
 const wallet=new MeshWallet({networkId:0,key:{type:'mnemonic',words:words(mnemonic)}});await wallet.init();return wallet.getChangeAddress();
}
// Preprod chain client: one agent wallet, metadata-only transactions under the project label, confirmation via Blockfrost.
export async function createChain({mnemonic=process.env.CARDANO_WALLET_MNEMONIC,apiKey=process.env.BLOCKFROST_API_KEY_PREPROD,label=LABEL}={}){
 if(!apiKey)throw new Error('BLOCKFROST_API_KEY_PREPROD is required');
 const provider=new BlockfrostProvider(apiKey);
 const wallet=new MeshWallet({networkId:0,fetcher:provider,submitter:provider,key:{type:'mnemonic',words:words(mnemonic)}});
 await wallet.init();
 const address=await wallet.getChangeAddress();
 const bf=async path=>{const r=await fetch(`${BLOCKFROST}${path}`,{headers:{project_id:apiKey},signal:AbortSignal.timeout(30000)});if(r.status===404)return null;if(!r.ok)throw new Error(`Blockfrost ${path} HTTP ${r.status}`);return r.json()};
 // Builds an unsigned transaction against the wallet's current UTxOs and protocol parameters. Nothing is sent.
 async function build(metadata){
  const builder=new MeshTxBuilder({fetcher:provider});
  const unsigned=await builder.metadataValue(label,metadata).changeAddress(address).selectUtxosFrom(await wallet.getUtxos()).complete();
  return {unsigned,feeLovelace:String(builder.meshTxBuilderBody.fee),sizeBytes:unsigned.length/2};
 }
 return {address,label,build,
  async balance(){const utxos=await wallet.getUtxos();return {utxos:utxos.length,lovelace:utxos.reduce((n,u)=>n+u.output.amount.filter(a=>a.unit==='lovelace').reduce((m,a)=>m+BigInt(a.quantity),0n),0n).toString()}},
  async submit(metadata){const {unsigned}=await build(metadata);return wallet.submitTx(await wallet.signTx(unsigned))},
  async waitConfirmed(txHash,timeoutMs=5*60*1000){
   const until=Date.now()+timeoutMs;
   while(Date.now()<until){const tx=await bf(`/txs/${txHash}`);if(tx)return {txHash,feeLovelace:tx.fees,sizeBytes:tx.size,block:tx.block_height};await new Promise(r=>setTimeout(r,10000))}
   throw new Error(`Transaction ${txHash} not confirmed within ${timeoutMs/60000} minutes. Check ${explorerUrl(txHash)} before retrying.`);
  },
  async readMetadata(txHash){const rows=await bf(`/txs/${txHash}/metadata`);return rows?.find(r=>String(r.label)===String(label))?.json_metadata??null}
 };
}
