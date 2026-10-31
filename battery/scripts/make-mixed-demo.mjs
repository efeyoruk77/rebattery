// Builds the second demo set in battery/demo-mixed/: the three NMC packs of battery/demo (A, B, C) plus
//   D: an LFP pack from another cell maker (LZ-LFP-100P), and
//   E: an NMC pack from the same cell maker as A-C but a different cell model (AC-NMC-78P).
// It copies A-C's signed test files, signs new module and cell tests for D and E with the demo tester key,
// and writes sample-events.json (mock extraction) for all five packs. Documents for D and E are hand-written.
// Run after battery/scripts/sign-demo-tests.mjs:  node battery/scripts/make-mixed-demo.mjs
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { signRecord } from '../canonical.mjs';
import { ingest, readManifestFiles } from '../ingest.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const demo = `${root}battery/demo/`;
const mixed = `${root}battery/demo-mixed/`;
const privateKey = createPrivateKey(readFileSync(`${root}.local/demo-tester-key.pem`));
const facility = { id: 'DSL-AUG-01', name: 'Demo Second Life GmbH', site: 'Plant 1, Augsburg, DE', note: 'invented for the demo' };
const CELLS_PER_MODULE = 12;

// Two more cell families. Values are invented but in the range of real cells of each type.
const families = {
  // LFP: 3.2 V nominal, 100 Ah prismatic, low resistance, ages slowly (SoH ~91%).
  D: { cell_model: 'LZ-LFP-100P', chemistry: 'LFP', nominal: 100.0, cellRes: 0.42,
       modules: [[91.2, 0.80], [90.8, 0.82], [91.5, 0.79], [90.4, 0.83], [91.0, 0.81], [90.9, 0.81], [91.3, 0.80], [90.6, 0.82]] },
  // NMC, same maker as A-C but a bigger cell model: 78 Ah, 7 modules (SoH ~89%).
  E: { cell_model: 'AC-NMC-78P', chemistry: 'NMC', nominal: 78.0, cellRes: 0.72,
       modules: [[69.5, 1.21], [69.9, 1.19], [69.2, 1.23], [70.1, 1.18], [69.7, 1.20], [69.4, 1.22], [69.8, 1.19]] },
};

let seed = 20261031;
const noise = (spread) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return (seed / 2 ** 31 - 0.5) * 2 * spread; };
const r = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

for (const dir of ['module-tests', 'cell-tests']) {
  rmSync(`${mixed}${dir}`, { recursive: true, force: true });
  mkdirSync(`${mixed}${dir}`, { recursive: true });
  for (const f of readdirSync(`${demo}${dir}`)) copyFileSync(`${demo}${dir}/${f}`, `${mixed}${dir}/${f}`);
}
copyFileSync(`${demo}tester-public.pem`, `${mixed}tester-public.pem`);
const write = (path, record) => writeFileSync(path, `${JSON.stringify(signRecord(record, privateKey), null, 2)}\n`);

let signed = 0;
for (const [pack, fam] of Object.entries(families)) {
  fam.modules.forEach(([capacity, resistance], i) => {
    const module_id = `${pack}-M${i + 1}`;
    write(`${mixed}module-tests/${module_id}.json`, {
      module_id, cell_model: fam.cell_model, chemistry: fam.chemistry, capacity_ah: capacity, nominal_capacity_ah: fam.nominal,
      internal_resistance_mohm: resistance, tested_on: '2026-10-28',
    });
    const cells = Array.from({ length: CELLS_PER_MODULE }, (_, c) => ({
      cell_id: `${module_id}-C${String(c + 1).padStart(2, '0')}`,
      capacity_ah: r(capacity + noise(0.4), 2),
      internal_resistance_mohm: r(fam.cellRes + noise(0.02), 3),
    }));
    write(`${mixed}cell-tests/${module_id}.json`, {
      module_id, cell_model: fam.cell_model, chemistry: fam.chemistry, nominal_capacity_ah: fam.nominal, tested_on: '2026-10-29', facility, cells,
    });
    signed++;
  });
}

// Mock extraction for D and E, in the same shape as battery/demo/sample-events.json. Quotes are word for word.
const docs = new Map(ingest(readManifestFiles(`${mixed}manifest.json`, mixed)).map((d) => [d.doc_id, d]));
const src = (doc_id, line, quote) => {
  const doc = docs.get(doc_id);
  const text = doc.pages[0].lines[line - 1] ?? '';
  if (!text.includes(quote)) throw new Error(`${doc_id} line ${line} does not contain "${quote}"`);
  return { doc_id, sha256: doc.sha256, page: 1, line, quote };
};
const ev = (event_id, type, date, fields, source) =>
  ({ event_id, pack_id: event_id[0], module_ids: [], cell_ids: [], type, date, fields, confidence: 'documented', source, basis: [] });
const extra = [
  ev('D-e1', 'production', '2021-05-18', { manufacturer: 'Lithosa Zellwerk GmbH', chemistry: 'LFP', cell_model: 'LZ-LFP-100P' }, src('packD-label', 10, 'Production date: 2021-05-18')),
  ev('D-e2', 'first_registration', '2021-07-02', {}, src('packD-registration', 8, 'Date of first registration: 2021-07-02')),
  ev('D-e3', 'soh_measurement', '2024-03-12', { soh_pct: 93, chemistry: 'LFP' }, src('packD-health-2024', 9, 'Measured state of health: 93 %')),
  ev('E-e1', 'production', '2021-09-09', { manufacturer: 'Altmark Cells GmbH', chemistry: 'NMC', cell_model: 'AC-NMC-78P' }, src('packE-label', 10, 'Production date: 2021-09-09')),
  ev('E-e2', 'first_registration', '2021-11-15', {}, src('packE-registration', 8, 'Date of first registration: 2021-11-15')),
  ev('E-e3', 'soh_measurement', '2023-08-21', { soh_pct: 89, chemistry: 'NMC' }, src('packE-health-2023', 9, 'Measured state of health: 89 %')),
];
const base = JSON.parse(readFileSync(`${demo}sample-events.json`, 'utf8'));
writeFileSync(`${mixed}sample-events.json`, `${JSON.stringify([...base, ...extra], null, 2)}\n`);
copyFileSync(`${demo}tampered-events.json`, `${mixed}tampered-events.json`);
console.log(`demo-mixed: copied A-C test files, signed ${signed} module tests and ${signed} cell test batches for D and E, wrote ${base.length + extra.length} sample events.`);
