// Files a buyer links instead of uploading on our machine (open problem #3).
// A job input entry may carry a public https `url` next to its sha256. The agent downloads the file, keeps it only if
// its SHA-256 equals the listed one, and stores it in the upload store, so loadJobInputs reads it like any upload.
// The job input's hash still fixes exactly which files were submitted: a changed file at the same link is refused.
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {ingestOne} from './battery/ingest.mjs';

export const REMOTE_LIMITS = {fileBytes: 5 * 1024 * 1024, totalBytes: 20 * 1024 * 1024, timeoutMs: 20000};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Only public https addresses: no plain http, no credentials in the link, no loopback, private, or link-local hosts,
// so a job input cannot make the agent read services on its own machine or network.
export function checkUrl(url) {
 let u;
 try { u = new URL(url); } catch { throw Error(`Invalid link ${String(url).slice(0, 80)}`); }
 if (u.protocol !== 'https:') throw Error(`${u.host}: only https links are accepted`);
 if (u.username || u.password) throw Error(`${u.host}: links must not contain credentials`);
 return u;
}
export function isPublicAddress(address) {
 const v = isIP(address);
 if (v === 4) {
  const [a, b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254)
   || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224);
 }
 if (v === 6) {
  const x = address.toLowerCase();
  if (x.startsWith('::ffff:')) return isPublicAddress(x.slice(7));
  return !(x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x));
 }
 return false;
}
async function assertPublicHost(hostname, resolve) {
 const host = hostname.replace(/^\[|\]$/g, '');
 const addresses = isIP(host) ? [host] : (await resolve(host)).map(a => a.address);
 if (!addresses.length || !addresses.every(isPublicAddress)) throw Error(`${host}: not a public address`);
}

// Reads at most `limit` bytes, so a large file cannot fill memory.
async function readCapped(response, limit, where) {
 const declared = Number(response.headers.get('content-length'));
 if (declared > limit) throw Error(`${where}: larger than ${limit} bytes`);
 const chunks = []; let size = 0;
 for await (const chunk of response.body) {
  size += chunk.length;
  if (size > limit) throw Error(`${where}: larger than ${limit} bytes`);
  chunks.push(chunk);
 }
 return Buffer.concat(chunks.map(c => Buffer.from(c)));
}

const indexPath = dir => join(dir, 'index.json');
const readIndex = dir => (existsSync(indexPath(dir)) ? JSON.parse(readFileSync(indexPath(dir), 'utf8')) : {});

// Downloads every linked file the store does not already hold with the listed hash. Stops on the first problem.
export async function fetchRemoteFiles(job, storeDir, {fetchImpl = fetch, resolve = h => lookup(h, {all: true}), limits = REMOTE_LIMITS} = {}) {
 const wanted = [
  ...(job.documents ?? []).filter(f => f.url).map(f => ({f, key: `doc:${f.doc_id}`})),
  ...(job.module_tests ?? []).filter(f => f.url).map(f => ({f, key: `test:${f.module_id}`})),
  ...(job.cell_tests ?? []).filter(f => f.url).map(f => ({f, key: `cells:${f.module_id}`})),
 ];
 if (!wanted.length) return 0;
 mkdirSync(storeDir, {recursive: true});
 const index = readIndex(storeDir);
 let total = 0, fetched = 0;
 for (const {f, key} of wanted) {
  if (index[`${key}@${f.sha256}`] && existsSync(join(storeDir, f.sha256))) continue;
  const u = checkUrl(f.url);
  await assertPublicHost(u.hostname, resolve);
  const response = await fetchImpl(u, {redirect: 'error', signal: AbortSignal.timeout(limits.timeoutMs)});
  if (!response.ok) throw Error(`${key}: download failed (HTTP ${response.status})`);
  const bytes = await readCapped(response, Math.min(limits.fileBytes, limits.totalBytes - total), key);
  total += bytes.length;
  const actual = sha256(bytes);
  if (actual !== f.sha256) throw Error(`${key}: the linked file does not match the job input (listed ${f.sha256}, downloaded ${actual})`);
  let entry = {sha256: actual};
  if (key.startsWith('doc:')) {
   entry = {sha256: actual, pack_id: f.pack_id, kind: f.kind, language: f.language, filename: `${f.doc_id}.txt`};
   ingestOne({doc_id: f.doc_id, ...entry, bytes}); // a document that cannot be read fails here, before the job
  } else {
   try { JSON.parse(bytes.toString('utf8')); } catch { throw Error(`${key}: a test file must be JSON`); }
  }
  writeFileSync(join(storeDir, actual), bytes);
  index[key] = entry;
  index[`${key}@${actual}`] = entry;
  fetched++;
 }
 writeFileSync(indexPath(storeDir), JSON.stringify(index, null, 2));
 return fetched;
}
