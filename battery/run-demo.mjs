// Runs Member 2's slice on the demo data:
// ingest -> verify -> check module tests -> screen modules -> check cell tests -> group cells into ESS units.
// Run: node battery/run-demo.mjs [--tampered] [--json]
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ingest, readManifestFiles } from './ingest.mjs';
import { verify } from './verify.mjs';
import { checkModuleTests, checkCellTests } from './tests.mjs';
import { group, screenModules } from './group.mjs';

const demo = fileURLToPath(new URL('./demo/', import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readDir = (dir) => readdirSync(`${demo}${dir}`).filter((f) => f.endsWith('.json')).map((f) => readJson(`${demo}${dir}/${f}`));

export function runDemo({ tampered = false, today } = {}) {
  const documents = ingest(readManifestFiles(`${demo}manifest.json`, demo));
  const events = [...readJson(`${demo}sample-events.json`), ...(tampered ? readJson(`${demo}tampered-events.json`) : [])];
  const verified = verify(documents, events, today ? { today } : {});
  const publicKeyPem = readFileSync(`${demo}tester-public.pem`, 'utf8');
  const packs = [...new Set(documents.map((d) => d.pack_id))];

  const modules = checkModuleTests(readDir('module-tests'), { publicKeyPem, packs });
  const screened = screenModules(modules.valid, verified.events, verified.warnings);
  const cells = checkCellTests(readDir('cell-tests'), { publicKeyPem, clearedModules: screened.cleared });
  const grouped = group(modules.valid, cells.valid, verified.events, verified.warnings, undefined, screened);
  return {
    documents,
    ...verified,
    rejected_tests: [...modules.rejected, ...cells.rejected],
    new_batteries: grouped.new_batteries,
    held_back: grouped.held_back,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = runDemo({ tampered: process.argv.includes('--tampered') });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`Documents: ${r.documents.length}  Verified events: ${r.events.length}  Rejected: ${r.rejected.length}`);
    for (const x of r.rejected) console.log(`  REJECTED ${x.event_id}: ${x.reason}`);
    for (const x of r.rejected_tests) console.log(`  REJECTED TEST ${x.id}: ${x.reason}`);
    for (const w of r.warnings) console.log(`  WARNING ${w.rule} [${w.events.join(', ')}]: ${w.message}`);
    for (const b of r.new_batteries) {
      const h = b.health;
      console.log(`${b.battery_id}: ${h.cell_count} cells from packs ${b.donor_packs.join(', ')} - SoH ${h.soh_pct}% ` +
        `(${h.usable_capacity_ah}/${h.nominal_capacity_ah} Ah) - made at ${b.second_life_facility.name}`);
    }
    for (const x of r.held_back) console.log(`  HELD BACK ${x.level} ${x.id}: ${x.reason}`);
  }
}
