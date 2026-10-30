import {BlockfrostProvider,MeshWallet,MeshTxBuilder,resolveTxHash} from '@meshsdk/core';
import {LABEL,explorerUrl,cleanError} from './cardano-log.mjs';
const BLOCKFROST='https://cardano-preprod.blockfrost.io/api/v0';
export {explorerUrl};
const words=mnemonic=>{const w=(mnemonic||'').trim().split(/\s+/);if(w.length!==24)throw new Error('CARDANO_WALLET_MNEMONIC must hold 24 words');return w};
export const brewMnemonic=()=>MeshWallet.brew();
// Address derivation needs no network. Used by the CLI before Blockfrost is configured.
export async function walletAddress(mnemonic=process.env.CARDANO_WALLET_MNEMONIC){
 const wallet=new MeshWallet({networkId:0,key:{type:'mnemonic',words:words(mnemonic)}});await wallet.init();return wallet.getChangeAddress();
}
// Preprod chain client: one log wallet, metadata-only transactions under the project label, confirmation via Blockfrost.
export async function createChain({mnemonic=process.env.CARDANO_WALLET_MNEMONIC,apiKey=process.env.BLOCKFROST_API_KEY_PREPROD,label=LABEL}={}){
 if(!apiKey)throw new Error('BLOCKFROST_API_KEY_PREPROD is required');
 const guard=promise=>promise.catch(e=>{throw cleanError(e,apiKey)});
 const provider=new BlockfrostProvider(apiKey);
 const wallet=new MeshWallet({networkId:0,fetcher:provider,submitter:provider,key:{type:'mnemonic',words:words(mnemonic)}});
 await guard(wallet.init());
 const address=await guard(wallet.getChangeAddress());
 const bf=async path=>{const r=await fetch(`${BLOCKFROST}${path}`,{headers:{project_id:apiKey},signal:AbortSignal.timeout(30000)});if(r.status===404)return null;if(!r.ok)throw new Error(`Blockfrost ${path} HTTP ${r.status}`);return r.json()};
 const onChain=async txHash=>{const t=await bf(`/txs/${txHash}`);return t&&{txHash,feeLovelace:t.fees,sizeBytes:t.size,block:t.block_height}};
 return {address,label,
  async balance(){const utxos=await guard(wallet.getUtxos());return {utxos:utxos.length,lovelace:utxos.reduce((n,u)=>n+u.output.amount.filter(a=>a.unit==='lovelace').reduce((m,a)=>m+BigInt(a.quantity),0n),0n).toString()}},
  // Builds and signs one metadata transaction against the wallet's current UTxOs. Nothing is sent.
  async prepare(metadata){
   const builder=new MeshTxBuilder({fetcher:provider});
   const unsigned=await guard(builder.metadataValue(label,metadata).changeAddress(address).selectUtxosFrom(await guard(wallet.getUtxos())).complete());
   const signedTx=await guard(wallet.signTx(unsigned));
   return {txHash:resolveTxHash(signedTx),signedTx,feeLovelace:String(builder.meshTxBuilderBody.fee),sizeBytes:signedTx.length/2};
  },
  async send(signedTx){return guard(wallet.submitTx(signedTx))},
  // 'confirmed' once in a block, 'pending' while Blockfrost's mempool holds it, null if the network has not seen it.
  async status(txHash){if(await onChain(txHash))return 'confirmed';return await bf(`/mempool/${txHash}`)?'pending':null},
  async waitConfirmed(txHash,timeoutMs=5*60*1000){
   const until=Date.now()+timeoutMs;let last;
   while(Date.now()<until){
    // A failed poll (rate limit, timeout) is retried until the deadline: the transaction may already be on its way.
    try{const t=await onChain(txHash);if(t)return t}catch(e){last=e}
    await new Promise(r=>setTimeout(r,10000));
   }
   throw new Error(`Transaction ${txHash} not confirmed within ${timeoutMs/60000} minutes${last?` (last error: ${last.message})`:''}. Check ${explorerUrl(txHash)}, then rerun: the same transaction is resent, never a second one.`);
  },
  async readMetadata(txHash){const rows=await bf(`/txs/${txHash}/metadata`);return rows?.find(r=>String(r.label)===String(label))?.json_metadata??null}
 };
}
