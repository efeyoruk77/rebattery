# Member 2: documents, verification, grouping

Deterministic code only (no AI). Shared formats are in [docs/team-plan.md](../docs/team-plan.md).

```
node battery/run-demo.mjs              # demo: verify -> warnings -> grouping
node battery/run-demo.mjs --tampered   # bonus scene: tampered claim is rejected
node battery/run-demo.mjs --json       # full output (documents, events, rejected, warnings, new_batteries)
node --env-file=.env battery/run-extract.mjs [A B C]   # real model on the demo documents, scored by verify() (needs npm start)
npm test
```

| Function | File |
|---|---|
| `extract(documents) -> events`, `extractAll(documents) -> { packs, events, warnings }` (AI, one pack per model call) | [extract.mjs](extract.mjs) |
| `ingest(files) -> documents`, `uploadDocuments`, `uploadModuleTests`, `loadJobInputs(jobInput, storeDir)` | [ingest.mjs](ingest.mjs) |
| `verify(documents, events) -> { events, rejected, warnings }` | [verify.mjs](verify.mjs), rules in [rules.mjs](rules.mjs) |
| `checkModuleTests(tests, { publicKeyPem, packs }) -> { valid, rejected }` | [module-tests.mjs](module-tests.mjs) |
| `group(moduleTests, events, warnings) -> newBatteries` | [group.mjs](group.mjs) |

All band and threshold values are in [config.mjs](config.mjs).

## Conventions other members must follow

- **Pages and lines** are numbered from 1. Blank lines count. In text files a form feed (`\f`) starts a new page.
- **Quotes** must be word-for-word, starting on `source.line` (they may run onto up to 2 more lines). Only whitespace is normalized; case and spelling must match.
- **Health values** go in `fields.soh_pct` as a number (e.g. `91`).
- **Modules and cells:** events name them in the lists `module_ids` and `cell_ids` (for example `["B-M1", "B-M2"]`). An accident with `module_ids: []` holds back the whole pack.
- **Dates** may be partial (`2020`, `2020-03`) when a document only states the year or month.
- **Module tests** are signed with Ed25519 over their canonical JSON (sorted keys, no `signature` field), base64. See [canonical.mjs](canonical.mjs).
- `group()` returns one entry per cell model + chemistry. `battery_id: null` means too few modules matched.

## Demo data

All data is invented. Documents are text files; the label "photos" are reviewed text transcripts (no OCR yet).
[demo/sample-events.json](demo/sample-events.json) is mock extraction output until Member 1's `extract()` is ready.
Regenerate with `node battery/scripts/make-sample-events.mjs` and `node battery/scripts/sign-demo-tests.mjs`
(the demo tester's private key is created in `.local/`, which is git-ignored).
