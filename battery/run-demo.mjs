// Runs Member 2's slice on the demo data: ingest -> verify -> check module tests -> group.
// Run: node battery/run-demo.mjs [--tampered] [--json]
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ingest, readManifestFiles } from './ingest.mjs';
import { verify } from './verify.mjs';
import { checkModuleTests } from './module-tests.mjs';
import { group } from './group.mjs';

const demo = fileURLToPath(new URL('./demo/', import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function runDemo({ tampered = false, today } = {}) {
  const documents = ingest(readManifestFiles(`${demo}manifest.json`, demo));
  const events = [...readJson(`${demo}sample-events.json`), ...(tampered ? readJson(`${demo}tampered-events.json`) : [])];
  const verified = verify(documents, events, today ? { today } : {});
  const tests = readdirSync(`${demo}module-tests`).filter((f) => f.endsWith('.json')).map((f) => readJson(`${demo}module-tests/${f}`));
  const packs = [...new Set(documents.map((d) => d.pack_id))];
  const checkedTests = checkModuleTests(tests, { publicKeyPem: readFileSync(`${demo}tester-public.pem`, 'utf8'), packs });
  const newBatteries = group(checkedTests.valid, verified.events, verified.warnings);
  return { documents, ...verified, rejected_module_tests: checkedTests.rejected, new_batteries: newBatteries };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = runDemo({ tampered: process.argv.includes('--tampered') });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`Documents: ${r.documents.length}  Verified events: ${r.events.length}  Rejected: ${r.rejected.length}`);
    for (const x of r.rejected) console.log(`  REJECTED ${x.event_id}: ${x.reason}`);
    for (const w of r.warnings) console.log(`  WARNING ${w.rule} [${w.events.join(', ')}]: ${w.message}`);
    for (const b of r.new_batteries) {
      console.log(`New battery ${b.battery_id ?? '(none)'} - ${b.cell_model}/${b.chemistry}: ${b.modules.length} modules`);
      console.log(`  ${b.modules.map((m) => m.module_id).join(' ')}`);
      for (const h of b.held_back) console.log(`  HELD BACK ${h.module_id}: ${h.reason}`);
    }
  }
}
