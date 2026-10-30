# Member 2: documents, verification, grouping

Deterministic code only (no AI). Shared formats are in [docs/team-plan.md](../docs/team-plan.md).

```
node battery/run-demo.mjs              # demo: verify -> warnings -> module screening -> cell grouping into ESS units
node battery/run-demo.mjs --tampered   # bonus scene: tampered claim is rejected
node battery/run-demo.mjs --json       # full output (documents, events, rejected, warnings, new_batteries, held_back)
npm test
```

| Function | File |
|---|---|
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
- **Damage to several modules:** one `accident` event per module (same quote), since `module_id` holds one module. An accident with `module_id: null` holds back the whole pack.
- **IDs:** modules `<pack>-M<number>` (`A-M2`), cells `<module_id>-C<number>` (`A-M2-C07`).
- **Test results** are signed with Ed25519 over their canonical JSON (sorted keys, no `signature` field), base64. Cell tests are signed per module batch. See [canonical.mjs](canonical.mjs).

## Demo data

All data is invented, including the facility (`Demo Second Life GmbH`). Documents are text files; the label "photos" are reviewed text transcripts (no OCR yet).
[demo/sample-events.json](demo/sample-events.json) is mock extraction output until Member 1's `extract()` is ready.
Regenerate with `node battery/scripts/make-sample-events.mjs` and `node battery/scripts/sign-demo-tests.mjs`
(the demo tester's private key is created in `.local/`, which is git-ignored).
