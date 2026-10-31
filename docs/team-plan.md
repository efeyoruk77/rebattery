# Team plan: History Recovery Agent for EV Batteries

How the work in [project-plan.md](project-plan.md) is split across four people. Member 1 owns all agent code (AI and deterministic), and Member 2 owns the demo material and the presentation.

**Frontend (review screen and status page): [frontend.md](frontend.md).** **Demo script draft: [demo-script.md](demo-script.md).** **What's still open, with owners: [open-problems.md](open-problems.md).** Check it before you start, and update it when you fix something.

The project's focus: several donor packs are taken apart in two steps. **Module screening:** a module with an accident, an open warning, or no traceable donor is held back and not taken apart. **Cell grouping:** the cells of cleared modules are tested and combined into new ESS units (energy storage systems) of a fixed size. Each ESS gets a QR code that shows its second-life health and the facility that made it, and links back to every donor.

| Member | Role | Owns plan steps | Main question they answer |
|---|---|---|---|
| 1 | Agent code: extraction, verification, screening, grouping | 3, 4, 5, 6 | "What do the documents say, is it really there, which modules may be taken apart, and which cells belong together?" |
| 2 | Demo material and presentation | 1 (demo files), demo, pitch | "What does the jury see, and is the story convincing?" |
| 3 | Cardano on-chain | 1 (anchor), 8 (key), 9, 10 | "Is it anchored, signed, and traceable from each ESS back to every donor?" |
| 4 | Sokosumi, Masumi, integration | 1 (upload), 2, 7, live demo run | "Can someone hire it, pay for it, and see the ESS passports?" |

The pipeline has two stages. Masumi requires the agent's result within 20 minutes of the funds being locked ([agent-api.mjs](../agent-api.mjs)), so the paid job produces a draft with no human step inside it. Signing and the event logs happen afterwards.

```
Stage A: paid draft (one Masumi job)
  Upload docs, module tests, cell test batches; hash each (4) -> Anchor hashes (3)
  -> Hire on Sokosumi, escrow locks (4)
  -> Ingest (1) -> Extract events (1) -> Verify quotes, flag inconsistencies (1)
  -> Screen modules, group cells into ESS units (1) -> Draft hash submitted to Masumi, payout (4)

Stage B: sign and publish (company, after payment)
  Review + sign draft, incl. Masumi result hash (4 UI, 3 key)
  -> Write donor + ESS event logs (3) -> ESS passport + QR code linked to all donors (3, 4)
```

## Shared data formats

All four members use these. Member 1 owns them; changes need a heads-up to the whole team. [battery/README.md](../battery/README.md) has the code-level conventions (page and line numbering, quote matching, signing).

**Document** (produced by ingestion from the uploaded files):

```json
{
  "doc_id": "packA-invoice-2021-de",
  "pack_id": "A",
  "kind": "service_invoice",
  "sha256": "…",
  "language": "de",
  "pages": [{ "page": 1, "lines": ["line 1 text", "line 2 text"] }]
}
```

**Event** (produced and verified by Member 1, written on-chain by Member 3):

```json
{
  "event_id": "A-e4",
  "pack_id": "A",
  "module_ids": ["A-M4"],
  "cell_ids": [],
  "type": "module_replacement",
  "date": "2021-06-14",
  "fields": { "reason": "cell imbalance" },
  "confidence": "documented",
  "source": { "doc_id": "packA-invoice-2021-de", "sha256": "…", "page": 1, "line": 13, "quote": "Modul 4 ersetzt (Grund: Zellungleichgewicht)" },
  "basis": []
}
```

- `module_ids` is a list, because one document line can name several modules (for example "modules 1 and 2" gives `["B-M1", "B-M2"]`). It is `[]` when the event is about the whole pack or no module can be identified. Module IDs are `<pack>-M<number>`.
- `cell_ids` is a list of cells the document names, `[]` otherwise. Cell IDs are `<module_id>-C<number>`, number padded to two digits (`A-M2-C07`). A document naming one cell fills only `cell_ids`; the cell's module goes in `module_ids` only if the document says the whole module was affected.
- An event with `module_ids` applies to every cell of those modules; an event with both lists empty applies to the whole pack.
- `type`: production, first_registration, module_replacement, cell_replacement, software_update, fault, soh_measurement, accident, charging_profile, warranty_claim, remaining_capacity_estimate.
- `confidence`: `signed`, `documented`, or `estimated`. Only code sets `signed`, from verified signatures; the AI never outputs it.
- `estimated` covers any uncertainty, in three cases:
  - **Uncertain reading:** the quoted text is partly illegible. `source.quote` holds the exact legible text; `fields.uncertainty` says what is unclear.
  - **Uncertain module:** the document names only an area (for example "front-left"). `fields.location` holds the area. `module_ids` is filled only from a module layout given in the input, otherwise `[]`. The AI never invents a module number.
  - **Derived value:** for example `remaining_capacity_estimate`. `source` is `null`, and `basis` lists the event IDs it was derived from.

**Module test** (one per module, signed by the second-life company):

```json
{
  "module_id": "A-M2",
  "cell_model": "AC-NMC-66P",
  "chemistry": "NMC",
  "capacity_ah": 58.1,
  "nominal_capacity_ah": 66,
  "internal_resistance_mohm": 1.42,
  "tested_on": "2026-10-28",
  "signature": "…"
}
```

**Cell test batch** (one per module taken apart, signed by the second-life company):

```json
{
  "module_id": "A-M2",
  "cell_model": "AC-NMC-66P",
  "chemistry": "NMC",
  "nominal_capacity_ah": 66,
  "tested_on": "2026-10-29",
  "facility": { "id": "DSL-AUG-01", "name": "…", "site": "…" },
  "cells": [{ "cell_id": "A-M2-C07", "capacity_ah": 58.4, "internal_resistance_mohm": 0.85 }],
  "signature": "…"
}
```

Test results are signed with Ed25519 over their canonical JSON (sorted keys, no `signature` field). Cell tests exist only for modules cleared by screening.

**New ESS** (produced by grouping; `health` and `second_life_facility` are what the QR code shows):

```json
{
  "battery_id": "ESS-1",
  "cell_model": "AC-NMC-66P",
  "chemistry": "NMC",
  "rules": { "capacity_band_pct": 2, "resistance_band_pct": 10, "cells_per_ess": 48 },
  "cells": [{ "cell_id": "A-M2-C07", "module_id": "A-M2", "donor_pack": "A" }],
  "donor_packs": ["A", "B", "C"],
  "health": {
    "cell_count": 48,
    "usable_capacity_ah": 57.11,
    "nominal_capacity_ah": 66,
    "soh_pct": 86.5,
    "avg_cell_capacity_ah": 57.72,
    "avg_cell_resistance_mohm": 0.85,
    "cells_tested_on": ["2026-10-29"],
    "basis": "signed cell test results"
  },
  "second_life_facility": { "id": "DSL-AUG-01", "name": "…", "site": "…" }
}
```

Cells are in series, so usable capacity and `soh_pct` follow the weakest cell.

**Held back** (modules not taken apart, and cells not used): `{ "id": "B-M1", "level": "module", "reason": "accident event B-e3; …; not taken apart" }` or `{ "id": "A-M2-C11", "level": "cell", "reason": "…" }`.

**Job input** (what the buyer sends to the Masumi job). The lists are exactly what the upload functions in [battery/ingest.mjs](../battery/ingest.mjs) return:

```json
{
  "packs": ["A", "B", "C"],
  "documents": [{ "doc_id": "packA-invoice-2021-de", "sha256": "…" }],
  "module_tests": [{ "module_id": "A-M2", "sha256": "…" }],
  "cell_tests": [{ "module_id": "A-M2", "sha256": "…" }]
}
```

Files are uploaded before the job starts; the job input lists them by ID and hash, so the Masumi input hash fixes exactly which files were submitted. [job-input.mjs](../job-input.mjs) checks the shape; `loadJobInputs` stops the job if any stored file differs from its listed hash.

**Draft** (stage A output: what the agent delivers and is paid for; its hash goes to Masumi):

```json
{
  "packs": ["A", "B", "C"],
  "documents": [{ "doc_id": "…", "pack_id": "A", "kind": "…", "sha256": "…", "anchor_tx": null }],
  "test_files": { "module_tests": [], "cell_tests": [] },
  "events": [],
  "rejected": [{ "event_id": "…", "reason": "quote not found …" }],
  "warnings": [{ "type": "inconsistency", "rule": "…", "events": ["A-e4", "A-e5"], "message": "…" }],
  "rejected_tests": [],
  "new_batteries": [],
  "held_back": []
}
```

**Signed record** (stage B output: what goes on Cardano):

```json
{
  "draft_hash": "…",
  "masumi_result_hash": "…",
  "masumi_blockchain_identifier": "…",
  "changes": "none, or what the company changed from the draft",
  "signer_public_key": "…",
  "signature": "…"
}
```

## Where code plugs in

[draft.mjs](../draft.mjs) runs stage A. All four steps are connected to the code in `battery/`:

| Step | Code | Status |
|---|---|---|
| `ingest` | `loadJobInputs` in [battery/ingest.mjs](../battery/ingest.mjs) | Connected |
| `extract` | `createExtractor({deadline}).extract` in [battery/extract.mjs](../battery/extract.mjs): one model call per pack through the local Eve agent | Connected; needs the model key in `.env` |
| `verify` | `verify` in [battery/verify.mjs](../battery/verify.mjs) | Connected |
| `group` | `checkModuleTests`, `screenModules`, `checkCellTests`, `group` | Connected |

Uploads are stored in `.local/uploads` (override with `UPLOAD_STORE_DIR`). Test signatures are checked with the demo tester key unless `TESTER_PUBLIC_KEY_PATH` is set.

[stage-b.mjs](../stage-b.mjs) runs stage B. It first checks that the draft matches the result hash paid through Masumi, then calls Member 3's `sign`, `writeDonorLogs`, and `writeNewBatteryLog`.

**Demo draft:** [examples/demo-draft.json](../examples/demo-draft.json) is stage A's real output on the demo files, with the hand-checked sample events standing in for the AI step: 11 events, 2 warnings, 1 rejected tampered claim, 5 ESS units of 48 cells, 3 modules not taken apart, and 12 cells not used. It also carries a real, checked model explanation of the grouping, recorded in [examples/demo-explanation.json](../examples/demo-explanation.json). Regenerate the draft with `node examples/demo-job.mjs` (add `--explain`, with `--env-file=.env` and `npm start` running, to ask the model again). `npm run review` shows it at http://127.0.0.1:21952.

## Member 1: Agent code

Owns everything the agent computes: the AI extraction and the deterministic code in `battery/` that checks it, screens modules, and groups cells. The AI is the "clerk": it reports what documents say, never what is true. Code, not AI, decides what is verified and what is grouped.

Tasks:
1. **Extraction:** tune [battery/extract.mjs](../battery/extract.mjs) and [agent/instructions.md](../agent/instructions.md) on the demo documents with `node --env-file=.env battery/run-extract.mjs` until all 11 expected events pass verification. Never invent a module or cell number.
2. **Grouping explanation:** make the GROUPING EXPLANATION part of the instructions read the draft's `new_batteries` (ESS units) and `held_back` (modules and cells, with `level`) instead of a New battery with `modules`.
3. **Cell IDs:** cell numbers are padded to two digits (`A-M3-C07`), as in the cell test batches. The instructions now say so; consider also padding in `normalizeEvent`, so a model reply with `C7` still matches.
4. **Keep the rules and grouping** (verification, inconsistency checks, module screening, cell grouping, ESS health) correct and tested. Rule values stay in [battery/config.mjs](../battery/config.mjs).
5. **Grouping explanation:** a plain-language explanation of each decision. It repeats rules and events; it never changes the decision.
6. Keep `npm test` passing.

Status (Oct 30): AI extraction merged on `main` and connected in stage A; `battery/` switched to `module_ids`/`cell_ids`; cells named by accidents or warnings are held back. Still to do: a scored run with the real model (needs the model key), and the grouping explanation for ESS units.

Done when: stage A on the demo files, with the real AI extraction instead of the sample events, produces the events, warnings, ESS units, and held-back items in [examples/demo-draft.json](../examples/demo-draft.json).

## Member 2: Demo material and presentation

Owns everything the jury sees and hears: the example documents the demo runs on, and the presentation around it.

Tasks:
1. **Example documents and test data** in `battery/demo/`: the documents for the three donor packs, signed module tests, signed cell test batches, the tampered claim, and the demo facility. Invented data only: no real names, VINs, or plates.
2. **Demo script:** turn the nine demo steps in the [project plan](project-plan.md) into a minute-by-minute script: who clicks what, what is said, and what appears on screen. The paid run must start about 40 minutes before presenting, because the payout unlocks about 36 minutes after the job starts.
3. **Slides:** the problem (2027 passport rule, pre-2027 batteries without passports, cells that age differently), modules first then cells, the ESS QR passport, why Cardano, and the limits from the project plan. Keep claims to what the demo actually shows.
4. **Rehearsal and backup:** rehearse end to end with Member 4 at least twice, and record a backup video of a full successful run.
5. **Submission:** follow the [submission checklist](https://www.masumi.network/tum-hackathon/submission) and collect the evidence from Members 3 and 4 (real TxHashes for the escrow payment, result hash, and event logs).

Status (Oct 30): demo documents, module tests, cell test batches, and the tampered claim are done and signed. Still to do: script, slides, rehearsal, video.

Done when: the slides and script are final, the backup video exists, and a full rehearsal ran without help.

## Member 3: Cardano on-chain

Writes everything permanent on Cardano Preprod, including the links between donor packs and the new ESS units. Uses the Cardano Foundation DPP standard's Event Log pattern and example code rather than building from scratch.

Tasks:
1. Map our Event, Module test, Cell test batch, and New ESS formats onto the DPP Event Log pattern ([cardano-mapping.md](cardano-mapping.md)) and share it with Member 1.
2. A fresh project Preprod wallet and Blockfrost key, kept in private env files (see [AGENTS.md](../AGENTS.md)).
3. **Anchor hashes:** each document's SHA-256 and each test file's SHA-256 from the draft's `test_files`.
4. **Signing (stage B, after payment):** the company signs the draft with its own key. The signed record includes the draft hash and the Masumi result hash and blockchain identifier.
5. **Donor event logs:** one per donor pack, holding its verified events and ending with a "disassembled" event: which modules were not taken apart (`held_back` with `level: "module"`) and which module's cells went to which ESS.
6. **ESS event logs:** one per ESS in `new_batteries`, starting with an "assembled from" event listing each cell, its module and donor pack, and a reference to that donor's log. It also records the ESS's `health` and `second_life_facility`.
7. **Passport and QR code:** one passport record per ESS that points to its event log and, through it, to every donor log. Give Member 4 the URL or identifier the QR code should open.
8. Measure the real cost of a full run (3 donor logs, 5 ESS logs and passports) and compare with the plan's 0.25 ADA estimate.
9. Ask the Masumi team how the result hash should link to several event logs in one job.
10. **Connect to [stage-b.mjs](../stage-b.mjs)** and test with [examples/demo-draft.json](../examples/demo-draft.json).

Status (Oct 30, evening): merged into `main` through PR #1. Tasks 1–7 and 10 are done in code and tested on the demo draft: anchoring of every document and test file, signing, donor logs, one log and passport per ESS with `health` and `second_life_facility`, QR links, and `trace`. Connected in `review.mjs`, with writes off until `CARDANO_WRITES_ENABLED=true`. Nothing has been sent on-chain yet. A dry run of the full demo builds all 14 transactions for about 3.08 tADA. Details and commands are in [member3-tasks.md](member3-tasks.md).

Blocked on the team: approval for the first real write, and the metadata label.

Done when: a full demo run produces real Preprod TxHashes for the anchors, all three donor logs, and every ESS log and passport. A cell can be followed from its ESS back to its source documents on a Preprod explorer.

Get team approval before each new kind of on-chain write or any funds transfer.

## Member 4: Sokosumi, Masumi, and integration

Makes the agent hireable and paid, connects all slices into one run, and runs the live demo.

Tasks:
1. **Repurpose the starter:** package name, README, and registration text. Done.
2. **Sokosumi:** Coworker "EV Battery History Recovery" created, runtime key stored, TUM Workspace access requested. Waiting for approval (Sandro).
3. **Job input and stage A:** the job input, its hash, and [draft.mjs](../draft.mjs) on both paid paths, connected to `battery/`. Done, with all four steps connected. Time a full three-pack run with the real model once the key is set; each pack is one model call with up to 3 minutes and retries, so raise it with the team if the run nears 20 minutes.
4. **Stage B flow and review screen:** [stage-b.mjs](../stage-b.mjs) and the review screen (`npm run review`) with timelines, warnings, rejected claims, one passport card per ESS (health, facility, donors, family tree), held-back modules and cells, and the Sign button. Done. Still to do: the QR code image per ESS, once Member 3 has the passport URL.
5. **File upload:** expose the upload functions in [battery/ingest.mjs](../battery/ingest.mjs) to the buyer and return the job input. Sokosumi supports task file uploads: `POST /v1/tasks/{id}/files` with filename, contentType, and size (from Sandro, Masumi tech lead). Check it first.
6. **Masumi payments:** set up our own Payment Service with a fresh database and selling wallet, register the agent with `AGENT_AUTHOR`, and enable paid tasks only after registration confirms. Fund the wallets from the [Masumi dispenser](https://dispenser.masumi.network).
7. **Model connection:** set the model provider in `.env` (waiting for the Masumi team's answer on credits) and run the first test task in the TUM Workspace.
8. **Live demo run:** operate the paid run during the presentation with Member 2's script, and collect the real TxHashes as evidence.

Done when: a paid task on Preprod delivers the three-pack draft inside the deadline, the seller's net receipt is checked, the signed record and event logs follow, and the TxHashes are shown live.

Get team approval before creating external accounts or resources, registering the agent, or moving funds.

## Order of work

| Phase | Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|---|
| 1. Now | Scored model run on the demo documents | Demo script outline | Adapt branch to ESS units, merge to `main` | Sokosumi approval, model connection, file upload |
| 2. Integrate | Tune on verifier rejections, grouping explanation | Slides | First approved write, cost numbers | Payment Service, registration, paid tasks, QR code, time a full run |
| 3. Demo | Fix extraction gaps | Rehearse, backup video, submission | Passport and trace for the demo | Paid demo run, collect TxHashes |

Integration checkpoints:
- End of phase 1: stage A runs on the demo files with the real AI extraction and matches [examples/demo-draft.json](../examples/demo-draft.json).
- Middle of phase 2: one full local run, from upload to signed record, without payment.
- End of phase 2: one full paid run on Preprod: draft delivered inside the deadline and paid, then signed, with real TxHashes for all donor logs, ESS logs, and passports.

## Team rules

- Do not commit `.env`, `.local/`, runtime JSON, private logs, seeds, or keys.
- Run `npm test` before every push.
- Keep [.gitattributes](../.gitattributes) on `main`: demo files are hashed byte for byte, and Git on Windows otherwise changes their line endings.
- When merging, keep the other members' plan changes; check `git diff` on `docs/` before pushing.
- Claim nothing in the demo that has not run: show real TxHashes only.
- Personal data stays off-chain. Only hashes and stripped events go on Cardano.
- Grouping is decided by code and signed by a human. The AI only explains it.
