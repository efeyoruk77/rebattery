// Live status of everything this project runs on the local machine, for the /status page.
// Reads local services, state files, and Blockfrost. Never returns keys or other secrets.
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const mtime = path => { try { return statSync(path).mtime.toISOString(); } catch { return null; } };

async function probe(url, ms = 2000) {
 try { const r = await fetch(url, {signal: AbortSignal.timeout(ms)}); return {up: true, http: r.status}; }
 catch { return {up: false}; }
}

function pidAlive(path) {
 try { const pid = Number(readFileSync(path, 'utf8')); process.kill(pid, 0); return {up: true, pid}; }
 catch { return {up: false}; }
}

// Blockfrost is rate-limited, so the wallet balance is cached for a minute.
let walletCache = {at: 0, value: null};
async function walletBalance(address) {
 if (!address || !process.env.BLOCKFROST_API_KEY_PREPROD) return null;
 if (Date.now() - walletCache.at < 60_000) return walletCache.value;
 try {
  const r = await fetch(`https://cardano-preprod.blockfrost.io/api/v0/addresses/${address}`, {headers: {project_id: process.env.BLOCKFROST_API_KEY_PREPROD}, signal: AbortSignal.timeout(8000)});
  const j = await r.json();
  const usdm = '16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde0014df10745553444d';
  const unit = u => Number(j.amount?.find(a => a.unit === u)?.quantity ?? 0);
  walletCache = {at: Date.now(), value: r.ok ? {ada: unit('lovelace') / 1e6, usdm: unit(usdm) / 1e6} : null};
 } catch { walletCache = {at: Date.now(), value: null}; }
 return walletCache.value;
}

function sokosumiAccess(root) {
 const files = existsSync(`${root}/.local`) ? readdirSync(`${root}/.local`).filter(f => /^coworker-connect-tum.*\.json$/.test(f)) : [];
 const latest = files.map(f => ({f, t: mtime(`${root}/.local/${f}`)})).sort((a, b) => b.t.localeCompare(a.t))[0];
 const access = latest && readJson(`${root}/.local/${latest.f}`)?.workspaceAccess;
 return access ? {status: access.status, checkedAt: latest.t} : {status: 'unknown', checkedAt: null};
}

function tasks(root) {
 const out = [];
 const dir = `${root}/.local`;
 for (const f of existsSync(dir) ? readdirSync(dir).filter(f => /^[0-9a-f-]{36}\.json$/.test(f)) : []) {
  const s = readJson(`${dir}/${f}`) ?? {};
  out.push({kind: 'Sokosumi task', id: f.slice(0, -5), phase: s.phase ?? null, paidStage: s.paid?.stage ?? null, settled: s.paid?.settlement?.verified ?? null, updatedAt: mtime(`${dir}/${f}`)});
 }
 const jobs = `${dir}/standard-jobs`;
 for (const f of existsSync(jobs) ? readdirSync(jobs).filter(f => /^[0-9a-f-]{36}\.json$/.test(f)) : []) {
  const j = readJson(`${jobs}/${f}`) ?? {};
  out.push({kind: 'Masumi job', id: f.slice(0, -5), phase: j.phase ?? null, paidStage: j.status ?? null, settled: null, updatedAt: mtime(`${jobs}/${f}`)});
 }
 return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 20);
}

// Open rows of docs/open-problems.md: number, title (first bold text), owner (the "Owner" column).
function openProblems(root) {
 let text; try { text = readFileSync(`${root}/docs/open-problems.md`, 'utf8').replace(/\r\n/g, '\n'); } catch { return {open: [], solved: 0}; }
 const [openPart, solvedPart = ''] = text.split('\n## Solved');
 const open = []; let ownerCol = -1;
 for (const line of openPart.split('\n')) {
  if (!line.startsWith('|')) { ownerCol = -1; continue; }
  const cells = line.split('|').slice(1, -1).map(c => c.trim());
  if (cells[0] === '#') { ownerCol = cells.findIndex(c => c === 'Owner'); continue; }
  if (!/^\d+$/.test(cells[0])) continue;
  open.push({n: Number(cells[0]), title: (cells[1].match(/\*\*(.+?)\*\*/)?.[1] ?? cells[1]).replace(/`/g, ''), owner: ownerCol >= 0 ? cells[ownerCol] : ''});
 }
 return {open, solved: (solvedPart.match(/^- /gm) || []).length};
}

function git(root) {
 try { return execFileSync('git', ['log', '-1', '--format=%h|%an|%ar|%s'], {cwd: root, encoding: 'utf8', timeout: 5000}).trim().split('|'); }
 catch { return null; }
}

export async function collectStatus(root = '.') {
 const env = process.env;
 const reg = readJson(`${root}/docs/registration-state.json`);
 const pay = readJson(`${root}/docs/payment-state.json`);
 const [eve, mps, api] = await Promise.all([
  probe(env.EVE_URL || 'http://127.0.0.1:21949'),
  probe(`${env.MPS_URL || 'http://127.0.0.1:38127'}/api/v1/health`),
  probe(`http://127.0.0.1:${env.AGENT_API_PORT || 21950}/availability`),
 ]);
 const signedDir = `${root}/.local/signed`;
 const commit = git(root);
 return {
  checkedAt: new Date().toISOString(),
  services: [
   {name: 'AI agent (Eve)', detail: `model ${env.ZAI_MODEL || 'not set'}`, start: 'npm start', ...eve},
   {name: 'Worker (Sokosumi tasks)', detail: env.PAID_TASKS_ENABLED === 'true' ? 'paid tasks on' : 'paid tasks off', start: 'npm run worker', ...pidAlive(`${root}/.local/worker.lock`)},
   {name: 'Masumi Payment Service', detail: 'port 38127, own PostgreSQL on 54330', start: 'powershell -File .local\\start-mps.ps1', ...mps},
   {name: 'Masumi agent API', detail: `port ${env.AGENT_API_PORT || 21950}`, start: 'npm run api', ...api},
  ],
  masumi: {
   registration: reg?.registrationState ?? reg?.status ?? 'not registered',
   agentName: reg?.request?.name ?? null,
   agentIdentifier: reg?.agentIdentifier ?? null,
   registrationTx: reg?.registrationTxHash ?? reg?.registration?.CurrentTransaction?.txHash ?? null,
   sellerAddress: pay?.sellerAddress ?? null,
   wallet: await walletBalance(pay?.sellerAddress),
  },
  sokosumi: {coworker: 'EV Battery History Recovery', ...sokosumiAccess(root)},
  tasks: tasks(root),
  cardano: {
   writesEnabled: env.CARDANO_WRITES_ENABLED === 'true',
   walletConfigured: existsSync(`${root}/.local/cardano.env`),
   signedDrafts: existsSync(signedDir) ? readdirSync(signedDir).filter(f => f.endsWith('.json')).length : 0,
  },
  team: {...openProblems(root), commit: commit && {hash: commit[0], author: commit[1], when: commit[2], subject: commit[3]}},
 };
}
