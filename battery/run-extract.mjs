// Runs the real model on the demo documents and scores it with verify() against the expected events.
// Needs the agent running (npm start). Run: node --env-file=.env battery/run-extract.mjs [A B C]
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ingest, readManifestFiles } from './ingest.mjs';
import { createExtractor } from './extract.mjs';
import { verify } from './verify.mjs';

const demo = fileURLToPath(new URL('./demo/', import.meta.url));
const packs = process.argv.slice(2);
const documents = ingest(readManifestFiles(`${demo}manifest.json`, demo)).filter((d) => !packs.length || packs.includes(d.pack_id));
const expected = JSON.parse(readFileSync(`${demo}sample-events.json`, 'utf8')).filter((e) => documents.some((d) => d.pack_id === e.pack_id));

const started = Date.now();
const out = await createExtractor({ log: (m) => console.log(`  retry: ${m}`) }).extractAll(documents);
const verified = verify(documents, out.events);
writeFileSync('.local/extract-run.json', JSON.stringify({ ...out, verified }, null, 2), { mode: 0o600 });

const key = (e) => `${e.pack_id} ${e.type} ${e.date} [${e.module_ids.join(',')}]`;
const rejected = new Map(verified.rejected.map((r) => [r.event_id, r.reason]));
console.log(`Model output in ${Math.round((Date.now() - started) / 1000)}s: ${out.events.length} events, ${verified.events.length} verified, ${verified.rejected.length} rejected\n`);
for (const e of out.events) {
  const status = rejected.has(e.event_id) ? `REJECTED (${rejected.get(e.event_id)})` : 'ok';
  console.log(`${e.event_id.padEnd(5)} ${key(e).padEnd(58)} ${e.confidence.padEnd(10)} ${status}`);
}
const found = new Set(verified.events.map(key));
const missing = expected.filter((e) => !found.has(key(e)));
console.log(`\nExpected events found: ${expected.length - missing.length}/${expected.length}`);
for (const e of missing) console.log(`  MISSING ${key(e)}  "${e.source.quote}"`);
for (const w of verified.warnings) console.log(`RULE WARNING ${w.rule}: ${w.message}`);
for (const w of out.warnings) console.log(`AI WARNING [${w.events.join(', ')}]: ${w.message}`);
console.log('\nFull output: .local/extract-run.json');
