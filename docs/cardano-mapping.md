# Cardano mapping (Member 3)

How the shared formats in [team-plan.md](team-plan.md) (Event, Module test, Cell test batch, New ESS, Held back, Signed record) are written to Cardano Preprod. Implemented in [cardano-log.mjs](../cardano-log.mjs); status and commands in [member3-tasks.md](member3-tasks.md).

## What the DPP standard gives us

Source: cardano-dpp-standards, `DPP-Blueprint-Cardano-v0.1.md` (draft).

- Event Log = append-only history. Full events stay **off-chain**; the chain holds a fingerprint plus a checkpoint number.
- The blueprint's code is a "not production ready" skeleton: no event schema, no metadata label, no library. It says to use a new integer metadata label, not 721, and recommends hash chaining for fewer than 100 events per checkpoint.

So we follow the pattern with plain transaction metadata and no validator. Library: Mesh SDK 1.9.1 with Blockfrost.

## Design

One **log** per donor pack (`pack:A`) and one per ESS (`battery:ESS-1`), plus one **passport** per ESS. A later batch of a log would carry `prev`, the transaction hash of the previous batch; the demo writes one batch per log.

All entries use one metadata label (placeholder `1984`, team to decide). Metadata holds only integers, text up to 64 UTF-8 bytes, lists, and maps. Longer text (signature, Masumi identifier) is a list of pieces split between characters. Decimals such as `soh_pct: 86.5` are written as text (`"86.5"`), and `null` values are left out. Every entry is checked against these rules and a size limit before a transaction is built.

### Stage A: anchors

```json
{ "v": 1, "type": "anchor",
  "docs":  { "packA-invoice-2021-de": "<sha256>" },
  "test":  { "A-M2": "<sha256 of the module test>" },
  "cells": { "A-M2": "<sha256 of the cell test batch>" } }
```

The groups match how `battery/ingest.mjs` stores uploads (`doc:`, `test:`, `cells:`), so a module test and the cell test batch of the same module never collide. Uploads that do not fit in one transaction are split into several (the job input allows 500 files). Stage B refuses to run until every file of the draft is anchored, because logs cannot change later.

### Stage B: donor log (one transaction per pack)

```json
{
  "v": 1, "log": "pack:A", "index": 0,
  "entries": [
    { "type": "events", "root": "<sha256 over the pack's verified events>", "count": 5, "anchors": ["<anchor tx>"] },
    { "type": "disassembled", "to": { "ESS-1": ["A-M1", "A-M3"] }, "not_taken_apart": ["A-M4"], "unused_cells": ["A-M2-C11"] }
  ],
  "draft": "<sha256 of the paid draft text>", "paid": "<Masumi result hash>", "masumi": "<blockchain identifier, or pieces>",
  "changes": "<sha256 of the changes text>", "signer": "<company Ed25519 public key>", "sig": ["<signature, 2 pieces>"]
}
```

`root` = sha256 over the sorted hashes of the pack's events in canonical JSON; the events with their quotes stay off-chain. `to` says which module's cells went to which ESS. `not_taken_apart` and `unused_cells` come from the draft's top-level `held_back` (`level: "module"` and `level: "cell"`); reasons stay off-chain.

### Stage B: ESS log and passport (two transactions per ESS)

```json
{
  "v": 1, "log": "battery:ESS-1", "index": 0,
  "entries": [{ "type": "assembled_from", "cell_model": "AC-NMC-66P", "chemistry": "NMC", "count": 48,
    "donors": { "pack:A": { "tx": "<pack:A log tx>", "modules": { "A-M3": ["A-M3-C01", "A-M3-C02"] } } },
    "health": { "soh_pct": "86.5", "cell_count": 48, "…": "…" },
    "facility": { "id": "DSL-AUG-01", "name": "…", "site": "…" } }],
  "draft": "…", "paid": "…", "masumi": "…", "changes": "…", "signer": "…", "sig": ["…"]
}
```

```json
{ "v": 1, "type": "passport", "battery": "ESS-1", "log_tx": "<ESS log tx>", "health": { "…": "…" }, "facility": { "…": "…" } }
```

The passport repeats `health` and `facility`, so the QR code shows the ESS card in one step. **QR code:** each passport's link is `https://preprod.cardanoscan.io/transaction/<passport tx>`. `npm run cardano -- stage-b` prints them, and `createCardanoSteps().passports(signedRecord)` returns them for the review screen.

Passport → ESS log → each donor log → events root and anchors. A cell can be followed both ways: the ESS log lists it under its module and donor, and the donor's `disassembled` entry sends that module to the ESS.

## Signature

[stage-b.mjs](../stage-b.mjs) builds `{draft_hash, masumi_result_hash, masumi_blockchain_identifier, changes}`, where `draft_hash` is the sha256 of the exact draft text that was paid for. Member 3's `sign(record)` returns `{signer_public_key, signature}`: Ed25519 over the sha256 of the canonical record including `signer_public_key`.

Every stage B log repeats the signed fields. `changes` is free text that may hold personal data, so only its hash goes on-chain. To verify, you need the draft text and the signed record JSON (for the `changes` text). Check the signature, compare its fields with the chain, and recompute the roots and cell lists. `npm run cardano -- trace` does all of this.

## Mapping per format

| Our format | On-chain | Off-chain |
|---|---|---|
| Document | sha256 under `docs` in an anchor | Original file, Document JSON |
| Module test, cell test batch | sha256 under `test` and `cells` in an anchor | Signed test JSON |
| Event | Inside its pack's `events` root | Full Event JSON with quotes |
| New ESS | `assembled_from` (cells per module and donor), `health`, `facility`; passport | `rules`, test values |
| Held back | `not_taken_apart`, `unused_cells` in the donor log | Reasons |
| Signed record | `draft`, `paid`, `masumi`, `changes` (hash), `signer`, `sig` in every log | `changes` text |

Only hashes, IDs, health figures, and the facility name go on-chain. No personal data.

## Open points

- Metadata label: the team must pick it before the first write.
- How the Masumi result hash should link to several logs in one job (question for Masumi). Current answer: `paid` and `masumi` are repeated in every log.
