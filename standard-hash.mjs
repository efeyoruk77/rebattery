import {createHash} from 'node:crypto';
export const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');
// Input schema permits one string field, the job input (see job-input.mjs). JSON.stringify is canonical for this fixed shape.
export const inputHash=(input,nonce)=>sha256(`${nonce};${JSON.stringify({job:input.job})}`);
export const resultHash=(result,nonce)=>sha256(`${nonce};${result}`);
