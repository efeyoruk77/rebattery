// Builds the public website for GitHub Pages:
// - index.html: a read-only copy of the review screen (no signing, no uploads), with the drafts as static JSON;
// - passport/<tx>/: one page per ESS passport, so a phone that scans the QR code opens a readable passport
//   instead of a blockchain explorer; passports.html lists them.
//   node --env-file-if-exists=.env passport-site.mjs [--out site]
// Then set PASSPORT_BASE_URL in .env to the site's https address, so the review screen's QR codes open it.
// Each page holds a copy of what the review server's /passport/<tx> page shows, checked against the chain
// when this script runs. Publish only drafts whose content may be public (the demo data is invented).
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {listDrafts, passportQrs} from './review.mjs';
import {collectStatus} from './status.mjs';
import {passportView, chainReader, TX} from './passport.mjs';

const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// ESS id -> passport tx, from the demo test run and from every draft signed on this machine.
export function passportTxs(root = '.') {
 const out = [];
 for (const [ess, tx] of Object.entries(readJson(`${root}/examples/demo-passports.json`)?.passports ?? {})) out.push({ess, tx, draft: 'demo'});
 const dir = `${root}/.local/signed`;
 for (const f of existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : []) {
  for (const [ess, p] of Object.entries(readJson(join(dir, f))?.passports ?? {})) out.push({ess, tx: p?.txHash, draft: f.slice(0, -5)});
 }
 return out.filter(p => TX.test(p.tx ?? ''));
}

// Only drafts built from the invented demo files may be public: every document and test file hash must be
// one of the files in battery/demo*/.
export function demoHashes(root = '.') {
 const out = new Set();
 const walk = dir => { for (const e of readdirSync(dir, {withFileTypes: true})) {
  const p = join(dir, e.name);
  if (e.isDirectory()) walk(p); else out.add(createHash('sha256').update(readFileSync(p)).digest('hex'));
 } };
 for (const d of readdirSync(join(root, 'battery'), {withFileTypes: true})) if (d.isDirectory() && d.name.startsWith('demo')) walk(join(root, 'battery', d.name));
 return out;
}
export function isDemoDraft(draftText, hashes) {
 try {
  const d = JSON.parse(draftText);
  const files = [...(d.documents ?? []), ...(d.test_files?.module_tests ?? []), ...(d.test_files?.cell_tests ?? [])];
  return files.length > 0 && files.every(f => hashes.has(f.sha256));
 } catch { return false; }
}

// The review screen reads /api/...; on the static site those answers are JSON files, and writes are refused.
const STATIC_SHIM = `<script>
window.STATIC_SITE = true;
(() => {
 const real = window.fetch.bind(window);
 const refuse = () => Promise.resolve(new Response(JSON.stringify({error: 'This is the public read-only copy. Uploading and signing run on the second-life company’s own machine.'}), {status: 403, headers: {'content-type': 'application/json'}}));
 window.fetch = (url, options) => {
  const u = String(url);
  if (u === '/api/drafts') return real('api/drafts.json');
  if (u.startsWith('/api/draft?')) return real('api/draft/' + encodeURIComponent(new URLSearchParams(u.split('?')[1]).get('id')) + '.json');
  if (u === '/api/status') return real('api/status.json');
  if (u.startsWith('/api/')) return refuse();
  return real(url, options);
 };
})();
</script>
<style>.static-note{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;max-width:calc(100vw - 32px);font-size:13px;padding:8px 14px;border-radius:999px;
 background:rgba(20,20,24,.6);color:#f5f5f4;border:1px solid rgba(255,255,255,.15);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);text-align:center}</style>`;
const STATIC_NOTE = '<div class="static-note">Public read-only demo · signing and uploads run on the company’s own machine · <a href="passports.html" style="color:inherit">all passports</a></div>';

// Embeds the passport data in the page, so it needs no server. "</" is escaped so the data cannot close the script tag.
export function staticPage(template, view) {
 const data = JSON.stringify(view).replace(/</g, '\\u003c');
 return template.replace('</head>', `<script>window.PASSPORT_DATA = ${data};</script>\n</head>`);
}

function indexPage(entries, checkedAt) {
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Battery Passports</title>
<style>:root{--bg:#fbfbfa;--panel:#fff;--ink:#0b0b0c;--muted:#6f6f78;--line:#e6e6e3}
@media (prefers-color-scheme:dark){:root{--bg:#08080a;--panel:#111114;--ink:#f5f5f4;--muted:#a1a1aa;--line:#26262b}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:720px;margin:0 auto;padding:24px 16px}
a.card{display:flex;justify-content:space-between;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:10px 0;text-decoration:none;color:inherit}
.muted{color:var(--muted)}h1{margin:0 0 6px}</style></head><body><main>
<h1>⚡ Battery passports</h1><p class="muted">Second-life energy storage units built from used EV battery packs. Each passport is recorded on Cardano Preprod. Checked against the chain on ${esc(checkedAt.slice(0, 10))}.</p>
${entries.map(e => `<a class="card" href="passport/${e.tx}/"><b>${esc(e.ess)}</b><span class="muted">${esc(e.health ?? '')}${e.testRun ? ' · test run' : ''} →</span></a>`).join('\n')}
</main></body></html>`;
}

export async function buildSite({out = 'site', root = '.', read = chainReader(), log = console.log} = {}) {
 const template = readFileSync(`${root}/passport.html`, 'utf8');
 if (!template.includes('</head>')) throw Error('passport.html changed: cannot find where to embed the data');
 const drafts = listDrafts(root);
 const signedFor = id => readJson(`${root}/.local/signed/${id}.json`)?.signedRecord ?? null;
 const checkedAt = new Date().toISOString();
 const hashes = demoHashes(root);
 rmSync(out, {recursive: true, force: true});
 mkdirSync(out, {recursive: true});
 const entries = [];
 for (const p of passportTxs(root)) {
  const view = await passportView(p.tx, read, drafts, {signedFor});
  // Only drafts built from the invented demo files may supply the history on a public page.
  const source = view.draft && drafts.find(d => d.id === view.draft.id);
  if (source && !isDemoDraft(source.draftText, hashes)) {
   for (const d of view.donors) for (const k of ['events', 'warnings', 'documents', 'testFiles']) delete d[k];
   view.checks = view.checks.map(c => /match the draft/.test(c.text) ? {...c, text: `${c.text} (history kept private: not demo data)`} : c);
  }
  view.checks = view.checks.map(c => ({...c, text: c.text.replace(/ on this machine/g, ' published with this page').replace(/this machine/g, 'this site')}));
  view.checkedAt = checkedAt;
  mkdirSync(join(out, 'passport', p.tx), {recursive: true});
  writeFileSync(join(out, 'passport', p.tx, 'index.html'), staticPage(template, view));
  entries.push({ess: view.ess.battery_id, tx: p.tx, health: view.ess.health?.soh_pct != null ? `${view.ess.health.soh_pct}% health` : '', testRun: view.payment.testRun});
  log(`${view.ess.battery_id}: passport/${p.tx}/`);
 }
 writeFileSync(join(out, 'passports.html'), indexPage(entries, checkedAt));

 // The read-only review screen, with every draft made from demo files.
 const published = drafts.filter(d => isDemoDraft(d.draftText, hashes));
 mkdirSync(join(out, 'api', 'draft'), {recursive: true});
 writeFileSync(join(out, 'api', 'drafts.json'), JSON.stringify(published.map(({id, label, paid}) => ({id, label, paid: Boolean(paid)}))));
 for (const d of published) writeFileSync(join(out, 'api', 'draft', `${encodeURIComponent(d.id)}.json`), JSON.stringify({id: d.id, paid: Boolean(d.paid), draft: JSON.parse(d.draftText), passports: await passportQrs(d.id, root)}));
 // A status snapshot: the public on-chain facts, without this machine's services (they are not running on the site).
 const status = await collectStatus();
 writeFileSync(join(out, 'api', 'status.json'), JSON.stringify({...status, services: [], snapshot: true}));
 const review = readFileSync(`${root}/review.html`, 'utf8');
 if (!review.includes('</head>') || !review.includes('</body>')) throw Error('review.html changed: cannot find where to add the static site parts');
 writeFileSync(join(out, 'index.html'), review.replace('</head>', `${STATIC_SHIM}
</head>`).replace('</body>', `${STATIC_NOTE}
</body>`));
 log(`Review screen: ${published.length} drafts (${drafts.length - published.length} not demo data, left out)`);
 writeFileSync(join(out, '.nojekyll'), '');
 return entries;
}

if (process.argv[1]?.endsWith('passport-site.mjs')) {
 const i = process.argv.indexOf('--out');
 const out = i > 0 ? process.argv[i + 1] : 'site';
 const entries = await buildSite({out});
 console.log(`Wrote ${entries.length} passport pages to ${out}/`);
}
