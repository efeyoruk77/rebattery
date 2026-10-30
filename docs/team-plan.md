# Team plan: History Recovery Agent for EV Batteries

How the work in [project-plan.md](project-plan.md) is split across four people. Updated Oct 30: Member 1 now owns all agent code (AI and deterministic), and Member 2 owns the demo material and the presentation.

The project's focus: several donor packs are taken apart, cells with matching health are regrouped into a new battery, and the new battery's passport links back to every donor. Events are tied to the pack, module, or cell their document names; testing and grouping happen per **cell**.

| Member | Role | Owns plan steps | Main question they answer |
|---|---|---|---|
| 1 | Agent code: extraction, verification, grouping | 3, 4, 5, 6 | "What do the documents say, is it really there, and which cells belong together?" |
| 2 | Demo material and presentation | 1 (demo files), demo, pitch | "What does the jury see, and is the story convincing?" |
| 3 | Cardano on-chain | 1 (anchor), 8 (key), 9, 10 | "Is it anchored, signed, and traceable from new battery back to every donor?" |
| 4 | Sokosumi, Masumi, integration | 1 (upload), 2, 7, live demo run | "Can someone hire it, pay for it, and see the family tree?" |

The pipeline has two stages. Masumi requires the agent's result within 20 minutes of the funds being locked ([agent-api.mjs](../agent-api.mjs)), so the paid job produces a draft with no human step inside it. Signing and the event logs happen afterwards.

```
Stage A: paid draft (one Masumi job)
  Upload docs + cell test files, hash each (4) -> Anchor hashes (3)
  -> Hire on Sokosumi, escrow locks (4)
  -> Ingest (1) -> Extract events (1) -> Verify quotes (1) -> Flag inconsistencies (1)
  -> Propose grouping (1) -> Draft hash submitted to Masumi, payout (4)

Stage B: sign and publish (company, after payment)
  Review + sign draft, incl. Masumi result hash (4 UI, 3 key)
  -> Write donor + new-battery event logs (3) -> New passport linked to all donors (3)
```

## Shared data formats

All four members use these. Member 1 owns them; changes need a heads-up to the whole team.

**Document** (produced by Member 1's ingestion from Member 2's demo files):

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

- `module_ids` is a list, because one document line can name several modules (for example "modules 1 and 2" gives `["B-M1", "B-M2"]`). It is `[]` when the event is about the whole pack or no module can be identified. Module IDs use the manufacturer's numbering: `<pack>-M<number>`.
- `cell_ids` is a list of cells the document names (for example "Modul 2 / Zelle 3" gives `["A-M2-C03"]`, with `module_ids: ["A-M2"]`). It is `[]` otherwise. Cell IDs are `<pack>-M<number>-C<number>`, cell number padded to two digits.
- Testing and grouping happen per cell: an event with `module_ids` applies to every cell of those modules, and an event with both lists empty applies to the whole pack.
- `type`: production, first_registration, module_replacement, cell_replacement, software_update, fault, soh_measurement, accident, charging_profile, warranty_claim, remaining_capacity_estimate.
- `confidence`: `signed`, `documented`, or `estimated`. Only code sets `signed`, from verified signatures; the AI never outputs it.
- `estimated` covers any uncertainty, in three cases:
  - **Uncertain reading:** the quoted text is partly illegible. `source.quote` holds the exact legible text; `fields.uncertainty` says what is unclear.
  - **Uncertain module:** the document names only an area (for example "front-left"). `fields.location` holds the area. `module_ids` is filled only from a module layout given in the input, otherwise `[]`. The AI never invents a module number.
  - **Derived value:** for example `remaining_capacity_estimate`. `source` is `null`, and `basis` lists the event IDs it was derived from.

**Cell test** (one row per cell, from a signed test file per pack; Member 2 makes the demo files, Member 1 reads them):

```json
{
  "cell_id": "A-M2-C03",
  "file_id": "packA-cell-tests",
  "cell_model": "AC-NMC-66P",
  "chemistry": "NMC",
  "capacity_ah": 58.4,
  "nominal_capacity_ah": 66.0,
  "internal_resistance_mohm": 1.42,
  "self_discharge_mv_day": 0.8,
  "tested_on": "2026-10-28"
}
```

The signature belongs to the test file, not to each row.

**New battery** (produced by Member 1's grouping):

```json
{
  "battery_id": "NB-1",
  "cell_model": "AC-NMC-66P",
  "chemistry": "NMC",
  "rules": { "capacity_band_pct": 3, "resistance_band_pct": 10, "max_self_discharge_mv_day": 2 },
  "cells": [{ "cell_id": "A-M1-C01", "donor_pack": "A" }],
  "held_back": [{ "cell_id": "B-M1-C01", "reason": "accident event B-e3 on module B-M1" }]
}
```

**Job input** (what the buyer sends to the Masumi job):

```json
{
  "packs": ["A", "B", "C"],
  "documents": [{ "doc_id": "packA-invoice-2021-de", "pack_id": "A", "sha256": "…" }],
  "cell_test_files": [{ "file_id": "packA-cell-tests", "pack_id": "A", "sha256": "…" }]
}
```

Files are uploaded before the job starts. The job input only lists them by ID and hash, so the Masumi input hash fixes exactly which files were submitted. [job-input.mjs](../job-input.mjs) validates it. Cell test results are listed as files (one per pack), because a pack has hundreds of cells and listing each would not fit.

**Draft** (stage A output: what the agent delivers and is paid for; its hash goes to Masumi):

```json
{
  "packs": ["A", "B", "C"],
  "documents": [{ "doc_id": "…", "pack_id": "A", "kind": "…", "sha256": "…", "anchor_tx": null }],
  "events": [],
  "rejected": [{ "event_id": "…", "reason": "quote not found" }],
  "warnings": [{ "type": "inconsistency", "rule": "…", "events": ["A-e4", "A-e5"], "message": "…" }],
  "cell_test_files": [],
  "cell_tests": [],
  "new_batteries": []
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

[draft.mjs](../draft.mjs) runs stage A. Each step fails with "not connected yet" until its owner supplies it. It already checks the deadline before each step and stops if any stored file doesn't match its listed hash.

| Step | Owner | Signature |
|---|---|---|
| `ingest` | Member 1 | `(jobInput) -> { documents, cellTestFiles, cellTests }` |
| `extract` | Member 1 | `(documents) -> events` |
| `verify` | Member 1 | `(documents, events) -> { events, rejected, warnings }` |
| `group` | Member 1 | `(cellTests, events, warnings) -> newBatteries` |

[stage-b.mjs](../stage-b.mjs) runs stage B. It first checks that the draft matches the result hash paid through Masumi, then calls:

| Step | Owner | Signature |
|---|---|---|
| `sign` | Member 3 | `(record) -> { signer_public_key, signature }` |
| `writeDonorLogs` | Member 3 | `(signedRecord, draft) -> txHashes` |
| `writeNewBatteryLog` | Member 3 | `(signedRecord, draft) -> txHashes` |

**Demo draft:** [examples/demo-draft.json](../examples/demo-draft.json) is the target output for the three-pack demo, built from the demo documents on the `member2/verify-and-grouping` branch: 12 events, 3 warnings, 1 rejected tampered claim, and 96 cells (81 used, 15 held back). `npm run review` shows it at http://127.0.0.1:21952.

## Member 1: Agent code

Owns everything the agent computes: the AI extraction and the deterministic code that checks it and groups cells. The AI is the "clerk": it reports what documents say, never what is true. Code, not AI, decides what is verified and how cells are grouped.

Takes over the code on the `member2/verify-and-grouping` branch (`battery/*.mjs`: ingest, verify, rules, module tests, grouping, and their tests). The demo files under `battery/demo/` stay with Member 2.

Tasks:
1. **Instructions:** keep [agent/instructions.md](../agent/instructions.md) in line with the formats above. Add `cell_ids` to the Event format, and in the grouping explanation read the New battery's `cells` and `held_back` instead of `modules`.
2. **Extraction:** given the Documents for one pack, return Events with a word-for-word quote and its page and line. Fill `module_ids` and `cell_ids` only when the document names them; never invent a number. Quotes stay in the original language; only `fields` are normalized to English. Strip personal data from `fields`.
3. **Ingestion:** turn each uploaded file into the Document format with page and line numbers and the SHA-256 of the original bytes. Read the cell test files into Cell test rows and check each file's signature.
4. **Quote verification and confidence rules:** reject any event whose quote is not at the stated page and line of the document with the matching hash. Reject `documented` or `signed` events without a verified quote, and `estimated` events whose `basis` points to missing or rejected events. Normalize whitespace only.
5. **Inconsistency checks:** the demo case (91% health 15 months after a module replacement), accident without a later inspection, dates out of order, health rising without a repair.
6. **Grouping per cell:** same cell model and chemistry, capacity and resistance within set bands, self-discharge below the limit, and no accident or open warning on the cell or its module. Record every held-back cell with a reason. Keep rule values in one config file.
7. **Grouping explanation:** a plain-language explanation of each decision from the grouping output. It repeats rules and events; it never changes the decision.
8. **Connect to [draft.mjs](../draft.mjs)** by supplying `ingest`, `extract`, `verify`, and `group`.
9. Tests with `node --test` for verification, each rule, and grouping. Keep `npm test` passing.

Status (Oct 30): instructions rewritten on `main`. The branch code verifies all 12 demo events and groups by module. Still to do: switch from `module_id` to the `module_ids`/`cell_ids` lists, from module tests to cell test files, and from module grouping to cell grouping; then merge to `main` and connect to `draft.mjs`.

Done when: running stage A on the demo files produces [examples/demo-draft.json](../examples/demo-draft.json): the expected events, the 91% warning, the tampered claim rejected, and 81 cells grouped with all cells of B-M1, B-M2, and A-M4 held back, plus A-M2-C03, B-M5-C04, and C-M6-C02.

## Member 2: Demo material and presentation

Owns everything the jury sees and hears: the example documents the demo runs on, and the presentation around it.

Tasks:
1. **Example documents:** keep the demo documents for the three donor packs under `battery/demo/` (label transcripts, registrations, the German and English invoices, the 2022 health report, the insurance record). Invented data only: no real names, VINs, or plates.
2. **Cell test files:** one signed test file per pack (for example a CSV with one row per cell, 8 modules of 4 cells each). Match the values in [examples/demo-draft.json](../examples/demo-draft.json) so the demo shows the same held-back cells. Agree the file layout and signing with Member 1.
3. **Bonus scene input:** the tampered claim (a "documented" fact that is not in the invoice) that verification rejects.
4. **Demo script:** turn the nine demo steps in the [project plan](project-plan.md) into a minute-by-minute script: who clicks what, what is said, and what appears on screen. The paid run must start about 40 minutes before presenting, because the payout unlocks about 36 minutes after the job starts.
5. **Slides:** the problem (2027 passport rule, pre-2027 batteries without passports, cells that age differently), how it works, why Cardano, and the limits from the project plan. Keep claims to what the demo actually shows.
6. **Rehearsal and backup:** rehearse end to end with Member 4 at least twice, and record a backup video of a full successful run.
7. **Submission:** follow the [submission checklist](https://www.masumi.network/tum-hackathon/submission) and collect the evidence from Members 3 and 4 (real TxHashes for the escrow payment, result hash, and event logs).

Status (Oct 30): demo documents and per-module test files exist on the `member2/verify-and-grouping` branch. Still to do: cell test files, script, slides, rehearsal, video.

Done when: the slides and script are final, the backup video exists, and a full rehearsal ran without help.

## Member 3: Cardano on-chain

Writes everything permanent on Cardano Preprod, including the links between donor packs and the new battery. Uses the Cardano Foundation DPP standard's Event Log pattern and example code rather than building from scratch.

Tasks:
1. Study the cardano-dpp-standards Event Log pattern and its example code. Map our Event, Cell test, and New battery formats onto it and share the mapping with Member 1.
2. Set up a fresh project Preprod wallet and Blockfrost key, kept in private env files (see [AGENTS.md](../AGENTS.md)). Never reuse another project's wallet.
3. **Anchor document hashes:** write each document's SHA-256 on-chain and return the transaction hash per document (fills `anchor_tx`).
4. **Signing (stage B, after payment):** let the second-life company sign the draft with its own key (a separate demo key from the agent's wallet). The signed record includes the draft hash and the Masumi result hash and blockchain identifier, so it points back to the exact draft that was paid for.
5. **Donor event logs:** one event log per donor pack, holding its verified events and ending with a "disassembled" event that says which cell went to which new battery and which were held back.
6. **New-battery event log:** starts with an "assembled from" event listing each cell, its donor pack, and a reference to that donor's event log.
7. **Passport link:** a minimal second-life passport record for the new battery that points to its event log and, through it, to every donor log.
8. Measure the real cost per batch and for a full three-donor run, and compare with the plan's 0.25 ADA estimate. With 81 cells, check how many cells fit in one batch record.
9. Ask the Masumi team how the result hash should link to several event logs in one job; this is an open question in the plan.
10. **Connect to [stage-b.mjs](../stage-b.mjs)** by supplying `sign`, `writeDonorLogs`, and `writeNewBatteryLog`. Test them with [examples/demo-draft.json](../examples/demo-draft.json).

Done when: a full demo run produces real Preprod TxHashes for the document anchors, all three donor logs, and the new-battery log. A cell can be followed from the new battery back to its source documents on a Preprod explorer.

Get team approval before each new kind of on-chain write or any funds transfer.

## Member 4: Sokosumi, Masumi, and integration

Makes the agent hireable and paid, connects all slices into one run, and runs the live demo.

Tasks:
1. **Repurpose the starter:** package name, README, and registration text for the battery agent. Done.
2. **Sokosumi:** Coworker "EV Battery History Recovery" created, runtime key stored, TUM Workspace access requested. Waiting for approval (Sandro).
3. **Job input and stage A flow:** the new job input, its hash, and [draft.mjs](../draft.mjs) on both paid paths. Done; waiting for Member 1's steps. Time a full three-pack run once they are connected; if it is close to 20 minutes, raise it with the team.
4. **Stage B flow and review screen:** [stage-b.mjs](../stage-b.mjs) and the review screen (`npm run review`) with timelines, warnings, rejected claims, the cell family tree, and the Sign button. Done; waiting for Member 3's steps.
5. **File upload:** a step that stores uploaded files and returns their IDs and SHA-256 for the job input. Sokosumi supports task file uploads: `POST /v1/tasks/{id}/files` with filename, contentType, and size (from Sandro, Masumi tech lead). Check it first.
6. **Masumi payments:** set up our own Payment Service with a fresh database and selling wallet, register the agent with `AGENT_AUTHOR`, and enable paid tasks only after registration confirms.
7. **Model connection:** set the model provider in `.env` and run the first test task in the TUM Workspace.
8. **Live demo run:** operate the paid run during the presentation with Member 2's script, and collect the real TxHashes as evidence.

Done when: a paid task on Preprod delivers the three-pack draft inside the deadline, the seller's net receipt is checked, the signed record and event logs follow, and the TxHashes are shown live.

Get team approval before creating external accounts or resources, registering the agent, or moving funds.

## Order of work

| Phase | Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|---|
| 1. Now | Switch branch code to cells, merge to `main` | Cell test files, demo script outline | Wallet, Event Log mapping, document anchoring | Sokosumi approval, model connection, file upload |
| 2. Integrate | Connect all four steps to `draft.mjs`, tune extraction | Slides | Signing, donor and new-battery logs, connect to `stage-b.mjs` | Payment Service, registration, paid tasks, time a full run |
| 3. Demo | Fix extraction gaps | Rehearse, backup video, submission | Passport link, cost numbers | Paid demo run, collect TxHashes |

Integration checkpoints:
- End of phase 1: stage A runs locally on the demo files and matches [examples/demo-draft.json](../examples/demo-draft.json).
- Middle of phase 2: one full local run, from upload to signed record, without payment.
- End of phase 2: one full paid run on Preprod: draft delivered inside the deadline and paid, then signed, with real TxHashes for all donor logs and the new-battery log.

## Team rules

- Do not commit `.env`, `.local/`, runtime JSON, private logs, seeds, or keys.
- Run `npm test` before every push.
- Keep [.gitattributes](../.gitattributes) on `main`: demo files are hashed byte for byte, and Git on Windows otherwise changes their line endings.
- Claim nothing in the demo that has not run: show real TxHashes only.
- Personal data stays off-chain. Only hashes and stripped events go on Cardano.
- Grouping is decided by code and signed by a human. The AI only explains it.
