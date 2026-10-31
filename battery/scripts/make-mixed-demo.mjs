// Builds the second demo set in battery/demo-mixed/: the three NMC packs of battery/demo (A, B, C) plus
//   D: an LFP pack from another cell maker (LZ-LFP-100P),
//   E: an NMC pack from the same cell maker as A-C but a different cell model (AC-NMC-78P),
//   F: an NCA pack with cylindrical cells (NZ-NCA-21700-5A),
//   G: an LFP pack from the same maker as D but a different cell model (LZ-LFP-135P), and
//   H: a pack with the same AC-NMC-66P cells as A-C, to show that one family does combine across packs,
//   I: an LMFP pack, J: a sodium-ion pack, K: an LMO/NMC-blend pack (older city car).
// It copies A-C's signed test files, signs new module and cell tests for D-K with the demo tester key,
// and writes sample-events.json (mock extraction) for all packs. Documents for D-H are hand-written.
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
  // NCA, cylindrical 21700-type cells: 5 Ah each, high resistance per cell (SoH ~88%).
  F: { cell_model: 'NZ-NCA-21700-5A', chemistry: 'NCA', nominal: 5.0, cellRes: 18.5, cellNoise: [0.04, 0.6],
       modules: [[4.41, 221], [4.38, 224], [4.43, 219], [4.36, 226], [4.40, 222], [4.42, 220], [4.37, 225], [4.39, 223]] },
  // LFP, same maker as D but a bigger cell model: 135 Ah (SoH ~94%).
  G: { cell_model: 'LZ-LFP-135P', chemistry: 'LFP', nominal: 135.0, cellRes: 0.31, cellNoise: [0.5, 0.015],
       modules: [[127.4, 0.62], [126.9, 0.63], [127.8, 0.61], [126.5, 0.64], [127.1, 0.62], [127.6, 0.61], [126.8, 0.63], [127.3, 0.62]] },
  // The same cell model as A-C, so its cells join the AC-NMC-66P units (SoH ~89%).
  H: { cell_model: 'AC-NMC-66P', chemistry: 'NMC', nominal: 66.0, cellRes: 0.85,
       modules: [[58.6, 1.43], [58.3, 1.45], [58.8, 1.42], [58.1, 1.46], [58.5, 1.44], [58.9, 1.41], [58.4, 1.44], [58.7, 1.43]] },
  // LMFP, 3.75 V nominal prismatic cells: 120 Ah (SoH ~93%).
  I: { cell_model: 'RP-LMFP-120P', chemistry: 'LMFP', nominal: 120.0, cellRes: 0.36, cellNoise: [0.5, 0.015],
       modules: [[111.8, 0.70], [112.3, 0.69], [111.5, 0.71], [112.0, 0.70], [111.9, 0.70], [112.4, 0.69], [111.6, 0.71], [112.1, 0.70]] },
  // Sodium-ion, 3.1 V nominal prismatic cells: 210 Ah, young pack (SoH ~95%).
  J: { cell_model: 'BN-NA-210P', chemistry: 'Na-ion', nominal: 210.0, cellRes: 0.34, cellNoise: [0.8, 0.015],
       modules: [[199.6, 0.68], [200.2, 0.67], [199.1, 0.69], [200.5, 0.67], [199.8, 0.68], [200.0, 0.68], [199.4, 0.69], [200.3, 0.67]] },
  // LMO/NMC blend, 94 Ah prismatic cells from an older city car (SoH ~83%).
  K: { cell_model: 'EA-LMO94P', chemistry: 'LMO-NMC', nominal: 94.0, cellRes: 0.95, cellNoise: [0.5, 0.03],
       modules: [[78.1, 1.92], [77.6, 1.95], [78.4, 1.90], [77.3, 1.97], [77.9, 1.93], [78.2, 1.91], [77.5, 1.96], [77.8, 1.94]] },
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
      capacity_ah: r(capacity + noise(fam.cellNoise?.[0] ?? 0.4), 2),
      internal_resistance_mohm: r(fam.cellRes + noise(fam.cellNoise?.[1] ?? 0.02), 3),
    }));
    write(`${mixed}cell-tests/${module_id}.json`, {
      module_id, cell_model: fam.cell_model, chemistry: fam.chemistry, nominal_capacity_ah: fam.nominal, tested_on: '2026-10-29', facility, cells,
    });
    signed++;
  });
}

// Mock extraction for D and E, in the same shape as battery/demo/sample-events.json. Quotes are word for word.
const docs = new Map(ingest(readManifestFiles(`${mixed}manifest.json`, mixed)).map((d) => [d.doc_id, d]));
// Pack identity from the documents: model and serial number from the label, VIN from the registration.
const field = (doc_id, prefix) => { const l = docs.get(doc_id)?.pages[0].lines.find((x) => x.startsWith(prefix)); return l ? l.slice(prefix.length).trim() : undefined; };
const ident = (p) => ({ manufacturer: field(`pack${p}-label`, 'Manufacturer:'), pack_model: field(`pack${p}-label`, 'Model:'), serial_number: field(`pack${p}-label`, 'Serial number:') });
const vin = (p) => ({ vin: field(`pack${p}-registration`, 'Vehicle identification number:') });
const src = (doc_id, line, quote) => {
  const doc = docs.get(doc_id);
  const text = doc.pages[0].lines[line - 1] ?? '';
  if (!text.includes(quote)) throw new Error(`${doc_id} line ${line} does not contain "${quote}"`);
  return { doc_id, sha256: doc.sha256, page: 1, line, quote };
};
const ev = (event_id, type, date, fields, source) =>
  ({ event_id, pack_id: event_id[0], module_ids: [], cell_ids: [], type, date, fields, confidence: 'documented', source, basis: [] });
const extra = [
  ev('D-e1', 'production', '2021-05-18', { ...ident('D'), chemistry: 'LFP', cell_model: 'LZ-LFP-100P' }, src('packD-label', 10, 'Production date: 2021-05-18')),
  ev('D-e2', 'first_registration', '2021-07-02', vin('D'), src('packD-registration', 8, 'Date of first registration: 2021-07-02')),
  ev('D-e3', 'soh_measurement', '2024-03-12', { soh_pct: 93, chemistry: 'LFP' }, src('packD-health-2024', 9, 'Measured state of health: 93 %')),
  ev('E-e1', 'production', '2021-09-09', { ...ident('E'), chemistry: 'NMC', cell_model: 'AC-NMC-78P' }, src('packE-label', 10, 'Production date: 2021-09-09')),
  ev('E-e2', 'first_registration', '2021-11-15', vin('E'), src('packE-registration', 8, 'Date of first registration: 2021-11-15')),
  ev('E-e3', 'soh_measurement', '2023-08-21', { soh_pct: 89, chemistry: 'NMC' }, src('packE-health-2023', 9, 'Measured state of health: 89 %')),
  ev('F-e1', 'production', '2020-11-23', { ...ident('F'), chemistry: 'NCA', cell_model: 'NZ-NCA-21700-5A' }, src('packF-label', 10, 'Production date: 2020-11-23')),
  ev('F-e2', 'first_registration', '2021-01-20', vin('F'), src('packF-registration', 8, 'Date of first registration: 2021-01-20')),
  ev('F-e3', 'soh_measurement', '2024-06-05', { soh_pct: 88, chemistry: 'NCA' }, src('packF-health-2024', 9, 'Measured state of health: 88 %')),
  ev('G-e1', 'production', '2022-02-14', { ...ident('G'), chemistry: 'LFP', cell_model: 'LZ-LFP-135P' }, src('packG-label', 10, 'Production date: 2022-02-14')),
  ev('G-e2', 'first_registration', '2022-03-30', vin('G'), src('packG-registration', 8, 'Date of first registration: 2022-03-30')),
  ev('G-e3', 'soh_measurement', '2025-01-15', { soh_pct: 95, chemistry: 'LFP' }, src('packG-health-2025', 9, 'Measured state of health: 95 %')),
  ev('H-e1', 'production', '2020-08-05', { ...ident('H'), chemistry: 'NMC', cell_model: 'AC-NMC-66P' }, src('packH-label', 10, 'Production date: 2020-08-05')),
  ev('H-e2', 'first_registration', '2020-10-01', vin('H'), src('packH-registration', 8, 'Date of first registration: 2020-10-01')),
  ev('H-e3', 'soh_measurement', '2023-05-10', { soh_pct: 90, chemistry: 'NMC' }, src('packH-health-2023', 9, 'Measured state of health: 90 %')),
  ev('I-e1', 'production', '2023-04-03', { ...ident('I'), chemistry: 'LMFP', cell_model: 'RP-LMFP-120P' }, src('packI-label', 10, 'Production date: 2023-04-03')),
  ev('I-e2', 'first_registration', '2023-05-19', vin('I'), src('packI-registration', 8, 'Date of first registration: 2023-05-19')),
  ev('I-e3', 'soh_measurement', '2025-09-02', { soh_pct: 94, chemistry: 'LMFP' }, src('packI-health-2025', 9, 'Measured state of health: 94 %')),
  ev('J-e1', 'production', '2024-01-22', { ...ident('J'), chemistry: 'Na-ion', cell_model: 'BN-NA-210P' }, src('packJ-label', 10, 'Production date: 2024-01-22')),
  ev('J-e2', 'first_registration', '2024-03-08', vin('J'), src('packJ-registration', 8, 'Date of first registration: 2024-03-08')),
  ev('J-e3', 'soh_measurement', '2026-02-17', { soh_pct: 96, chemistry: 'Na-ion' }, src('packJ-health-2026', 9, 'Measured state of health: 96 %')),
  ev('K-e1', 'production', '2018-06-27', { ...ident('K'), chemistry: 'LMO-NMC', cell_model: 'EA-LMO94P' }, src('packK-label', 10, 'Production date: 2018-06-27')),
  ev('K-e2', 'first_registration', '2018-08-14', vin('K'), src('packK-registration', 8, 'Date of first registration: 2018-08-14')),
  ev('K-e3', 'soh_measurement', '2024-11-26', { soh_pct: 84, chemistry: 'LMO-NMC' }, src('packK-health-2024', 9, 'Measured state of health: 84 %')),
];
const base = JSON.parse(readFileSync(`${demo}sample-events.json`, 'utf8'));
writeFileSync(`${mixed}sample-events.json`, `${JSON.stringify([...base, ...extra], null, 2)}\n`);
copyFileSync(`${demo}tampered-events.json`, `${mixed}tampered-events.json`);
console.log(`demo-mixed: copied A-C test files, signed ${signed} module tests and ${signed} cell test batches for D-H, wrote ${base.length + extra.length} sample events.`);
