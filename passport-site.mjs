// Builds the public passport website: one page per ESS passport, so a phone that scans the QR code
// opens a readable passport instead of a blockchain explorer. Publish the output folder with GitHub Pages.
//   node --env-file-if-exists=.env passport-site.mjs [--out site]
// Then set PASSPORT_BASE_URL in .env to the site's https address, so the review screen's QR codes open it.
// Each page holds a copy of what the review server's /passport/<tx> page shows, checked against the chain
// when this script runs. Publish only drafts whose content may be public (the demo data is invented).
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {listDrafts} from './review.mjs';
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
 rmSync(out, {recursive: true, force: true});
 mkdirSync(out, {recursive: true});
 const entries = [];
 for (const p of passportTxs(root)) {
  const view = await passportView(p.tx, read, drafts, {signedFor});
  // Only drafts that are meant to be public may supply the history on a public page.
  if (view.draft && !['demo', 'e2e'].includes(view.draft.id) && process.env.PUBLISH_PAID_HISTORIES !== 'true') {
   for (const d of view.donors) for (const k of ['events', 'warnings', 'documents', 'testFiles']) delete d[k];
   view.checks = view.checks.map(c => /match the draft/.test(c.text) ? {...c, text: `${c.text} (history kept private; set PUBLISH_PAID_HISTORIES=true to publish it)`} : c);
  }
  view.checks = view.checks.map(c => ({...c, text: c.text.replace(/ on this machine/g, ' published with this page').replace(/this machine/g, 'this site')}));
  view.checkedAt = checkedAt;
  mkdirSync(join(out, 'passport', p.tx), {recursive: true});
  writeFileSync(join(out, 'passport', p.tx, 'index.html'), staticPage(template, view));
  entries.push({ess: view.ess.battery_id, tx: p.tx, health: view.ess.health?.soh_pct != null ? `${view.ess.health.soh_pct}% health` : '', testRun: view.payment.testRun});
  log(`${view.ess.battery_id}: passport/${p.tx}/`);
 }
 writeFileSync(join(out, 'index.html'), indexPage(entries, checkedAt));
 writeFileSync(join(out, '.nojekyll'), '');
 return entries;
}

if (process.argv[1]?.endsWith('passport-site.mjs')) {
 const i = process.argv.indexOf('--out');
 const out = i > 0 ? process.argv[i + 1] : 'site';
 const entries = await buildSite({out});
 console.log(`Wrote ${entries.length} passport pages to ${out}/`);
}
