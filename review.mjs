// Local review screen for stage B: show a draft, then sign and publish it.
// Lists the demo draft plus every paid draft found in local job state.
import {createServer} from 'node:http';
import {existsSync,readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createStageB} from './stage-b.mjs';
import {createCardanoSteps} from './cardano-steps.mjs';

// Member 3's Cardano steps are connected here, not in stage-b.mjs defaults, so tests never reach the real chain.
// Writes stay off until CARDANO_WRITES_ENABLED=true.
const finalize = createStageB(createCardanoSteps());
const DEMO = 'examples/demo-draft.json';
const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const files = dir => existsSync(dir) ? readdirSync(dir).filter(f => /^[0-9a-f-]{36}\.json$/.test(f)) : [];

export function listDrafts(root = '.') {
 const drafts = [];
 if (existsSync(`${root}/${DEMO}`)) drafts.push({id: 'demo', label: 'Demo draft (invented data, not paid)', draftText: readFileSync(`${root}/${DEMO}`, 'utf8'), paid: null});
 // Masumi standard API jobs (agent-api.mjs).
 for (const f of files(`${root}/.local/standard-jobs`)) {
  const j = readJson(`${root}/.local/standard-jobs/${f}`);
  if (j?.status === 'completed' && j.result) drafts.push({id: `job-${j.id}`, label: `Masumi job ${j.id}`, draftText: j.result, paid: {nonce: j.nonce, resultHash: j.resultHash, blockchainIdentifier: j.payment?.blockchainIdentifier}});
 }
 // Sokosumi paid tasks (worker.mjs + paid-task.mjs).
 for (const f of files(`${root}/.local`)) {
  const p = readJson(`${root}/.local/${f}`)?.paid;
  if (p?.result && ['awaiting-withdrawal', 'settled'].includes(p.stage)) drafts.push({id: `task-${f.slice(0, -5)}`, label: `Sokosumi task ${f.slice(0, -5)}`, draftText: p.result, paid: {hashScheme: 'task', resultHash: p.resultHash, blockchainIdentifier: p.payment?.blockchainIdentifier}});
 }
 return drafts;
}

const respond = (res, status, data, type = 'application/json') => { res.writeHead(status, {'content-type': type}); res.end(type === 'application/json' ? JSON.stringify(data) : data); };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const port = Number(process.env.REVIEW_PORT || 21952);
 createServer(async (req, res) => {
  try {
   const url = new URL(req.url, 'http://127.0.0.1');
   if (req.method === 'GET' && url.pathname === '/') return respond(res, 200, readFileSync('review.html', 'utf8'), 'text/html; charset=utf-8');
   if (req.method === 'GET' && url.pathname === '/api/drafts') return respond(res, 200, listDrafts().map(({id, label, paid}) => ({id, label, paid: Boolean(paid)})));
   if (req.method === 'GET' && url.pathname === '/api/draft') {
    const d = listDrafts().find(x => x.id === url.searchParams.get('id'));
    return d ? respond(res, 200, {id: d.id, paid: Boolean(d.paid), draft: JSON.parse(d.draftText)}) : respond(res, 404, {error: 'Draft not found'});
   }
   if (req.method === 'POST' && url.pathname === '/api/sign') {
    let body = ''; for await (const part of req) { body += part; if (body.length > 20000) return respond(res, 413, {error: 'Request too large'}); }
    const {id, changes} = JSON.parse(body || '{}');
    const d = listDrafts().find(x => x.id === id);
    if (!d) return respond(res, 404, {error: 'Draft not found'});
    if (!d.paid) return respond(res, 400, {error: 'Only a paid draft can be signed. The demo draft is for display.'});
    const out = await finalize({draftText: d.draftText, ...d.paid}, {changes: typeof changes === 'string' && changes.trim() ? changes.trim().slice(0, 2000) : 'none'});
    mkdirSync('.local/signed', {recursive: true, mode: 0o700});
    writeFileSync(`.local/signed/${id}.json`, JSON.stringify(out, null, 2), {mode: 0o600});
    return respond(res, 200, out);
   }
   respond(res, 404, {error: 'Route not found'});
  } catch (e) { respond(res, 500, {error: e.message.slice(0, 300)}); }
 }).listen(port, '127.0.0.1', () => console.log(`Review screen: http://127.0.0.1:${port}`));
}
