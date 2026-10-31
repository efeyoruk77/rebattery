# Member 2: documents, verification, grouping

Deterministic code only (no AI). Shared formats are in [docs/team-plan.md](../docs/team-plan.md).

```
node battery/run-demo.mjs              # demo: verify -> warnings -> module screening -> cell grouping into ESS units
node battery/run-demo.mjs --tampered   # bonus scene: tampered claim is rejected
node battery/run-demo.mjs --json       # full output (documents, events, rejected, warnings, new_batteries, held_back)
node --env-file=.env battery/run-extract.mjs [A B C]   # real model on the demo documents, scored by verify() (needs npm start)
npm test
```

| Function | File |
|---|---|
| `extract(documents) -> events`, `extractAll(documents) -> { packs, events, warnings }` (AI, one pack per model call) | [extract.mjs](extract.mjs) |
| `ingest(files) -> documents`, `uploadDocuments`, `uploadModuleTests`, `uploadCellTests`, `loadJobInputs(jobInput, storeDir)` | [ingest.mjs](ingest.mjs) |
| `verify(documents, events) -> { events, rejected, warnings }` | [verify.mjs](verify.mjs), rules in [rules.mjs](rules.mjs) |
| `checkModuleTests(tests, { publicKeyPem, packs })`, `checkCellTests(batches, { publicKeyPem, clearedModules })` | [tests.mjs](tests.mjs) |
| `screenModules(moduleTests, events, warnings) -> { cleared, held_back }` | [group.mjs](group.mjs) |
| `group(moduleTests, cells, events, warnings) -> { new_batteries, held_back }` | [group.mjs](group.mjs) |

All band and threshold values are in [config.mjs](config.mjs).

## How grouping works

1. **Module screening.** A module with an accident, an open warning, or no traceable donor is held back and not taken apart.
2. **Cell grouping.** Cells of cleared modules are tested. Resistance outliers are held back first. The rest are sorted by capacity and filled into ESS units of `cells_per_ess` cells, each within the capacity and resistance bands. Cells that cannot fill a whole ESS are held back as left-overs.
3. **QR code data.** Each ESS gets `health` (usable capacity follows the weakest cell, since cells are in series) and `second_life_facility`, both from signed cell tests.

## Conventions other members must follow

- **Pages and lines** are numbered from 1. Blank lines count. In text files a form feed (`\f`) starts a new page.
- **Quotes** must be word-for-word, starting on `source.line` (they may run onto up to 2 more lines). Only whitespace is normalized; case and spelling must match.
- **Health values** go in `fields.soh_pct` as a number (e.g. `91`).
- **Modules and cells:** events name them in the lists `module_ids` and `cell_ids` (for example `["B-M1", "B-M2"]`). An accident with `module_ids: []` holds back the whole pack.
- **Dates** may be partial (`2020`, `2020-03`) when a document only states the year or month.
- **IDs:** modules `<pack>-M<number>` (`A-M2`), cells `<module_id>-C<number>` (`A-M2-C07`).
- **Test results** are signed with Ed25519 over their canonical JSON (sorted keys, no `signature` field), base64. Cell tests are signed per module batch. See [canonical.mjs](canonical.mjs).

## Demo data

A second set, `battery/demo-mixed/`, reuses packs A–C and adds D (LFP `LZ-LFP-100P`), E (NMC `AC-NMC-78P`, same maker as A–C, other model), F (NCA `NZ-NCA-21700-5A`, cylindrical), G (LFP `LZ-LFP-135P`, same maker as D, other model) and H (the same `AC-NMC-66P` cells as A–C). Grouping keeps the five cell families apart and merges H into the A–C units; `assertOneFamily` in [group.mjs](group.mjs) throws if a unit would ever mix families (tests: [family.test.mjs](family.test.mjs)). Build it with `node battery/scripts/make-mixed-demo.mjs`, then `node examples/demo-mixed-job.mjs` writes `examples/demo-mixed-draft.json`. Facts about chemistries and German EV batteries: [docs/battery-info.md](../docs/battery-info.md).

All data is invented, including the facility (`Demo Second Life GmbH`). Documents are text files; the label "photos" are reviewed text transcripts (no OCR yet).
[demo/sample-events.json](demo/sample-events.json) is mock extraction output until Member 1's `extract()` is ready.
Regenerate with `node battery/scripts/make-sample-events.mjs` and `node battery/scripts/sign-demo-tests.mjs`
(the demo tester's private key is created in `.local/`, which is git-ignored).
