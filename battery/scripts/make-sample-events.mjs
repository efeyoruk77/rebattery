// Writes mock extraction output for the demo packs (what Member 1's extract() should produce),
// plus the tampered input for the bonus scene. Hashes come from the demo documents.
// Run: node battery/scripts/make-sample-events.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ingest, readManifestFiles } from '../ingest.mjs';

const demo = fileURLToPath(new URL('../demo/', import.meta.url));
const docs = new Map(ingest(readManifestFiles(`${demo}manifest.json`, demo)).map((d) => [d.doc_id, d]));
const src = (doc_id, line, quote) => ({ doc_id, sha256: docs.get(doc_id).sha256, page: 1, line, quote });
const ev = (event_id, type, date, module_id, fields, source) =>
  ({ event_id, pack_id: event_id[0], module_id, type, date, fields, confidence: 'documented', source, basis: [] });

const events = [
  ev('A-e1', 'production', '2020-03-11', null, { manufacturer: 'Altmark Cells GmbH', chemistry: 'NMC' }, src('packA-label', 9, 'Production date: 2020-03-11')),
  ev('A-e2', 'first_registration', '2020-05-12', null, {}, src('packA-registration', 8, 'Date of first registration: 2020-05-12')),
  ev('A-e3', 'fault', '2021-06-14', 'A-M4', { finding: 'voltage difference, cell imbalance' }, src('packA-invoice-2021-de', 10, 'Spannungsdifferenz in Modul 4, Zellungleichgewicht')),
  ev('A-e4', 'module_replacement', '2021-06-14', 'A-M4', { reason: 'cell imbalance' }, src('packA-invoice-2021-de', 13, 'Modul 4 ersetzt (Grund: Zellungleichgewicht)')),
  ev('A-e5', 'soh_measurement', '2022-09-20', null, { soh_pct: 91 }, src('packA-health-2022', 8, 'Measured state of health: 91 %')),
  ev('B-e1', 'production', '2020-04-02', null, { manufacturer: 'Altmark Cells GmbH', chemistry: 'NMC' }, src('packB-label', 9, 'Production date: 2020-04-02')),
  ev('B-e2', 'first_registration', '2020-06-30', null, {}, src('packB-registration', 8, 'Date of first registration: 2020-06-30')),
  ev('B-e3', 'accident', '2023-02-07', 'B-M1', { damage_area: 'front left underbody', severity: 'moderate' }, src('packB-insurance-2023', 11, 'The battery housing is deformed near modules 1 and 2.')),
  ev('B-e4', 'accident', '2023-02-07', 'B-M2', { damage_area: 'front left underbody', severity: 'moderate' }, src('packB-insurance-2023', 11, 'The battery housing is deformed near modules 1 and 2.')),
  ev('C-e1', 'production', '2020-02-19', null, { manufacturer: 'Altmark Cells GmbH', chemistry: 'NMC' }, src('packC-label', 9, 'Production date: 2020-02-19')),
  ev('C-e2', 'first_registration', '2020-04-21', null, {}, src('packC-registration', 8, 'Date of first registration: 2020-04-21')),
  ev('C-e3', 'software_update', '2022-11-03', null, { component: 'battery management system', version: '4.2.1' }, src('packC-invoice-2022-en', 11, 'Battery management system software updated to version 4.2.1')),
];

// Bonus scene: a "documented" claim that the invoice does not contain.
const tampered = [
  ev('A-x1', 'soh_measurement', '2021-06-14', 'A-M4', { soh_pct: 100 }, src('packA-invoice-2021-de', 13, 'Batteriekapazitaet auf 100 % wiederhergestellt')),
];

const write = (name, data) => writeFileSync(`${demo}${name}`, `${JSON.stringify(data, null, 2)}\n`);
write('sample-events.json', events);
write('tampered-events.json', tampered);
console.log(`Wrote ${events.length} sample events and ${tampered.length} tampered event.`);
