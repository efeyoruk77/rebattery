# Cardano mapping (Member 3)

How the shared formats in [team-plan.md](team-plan.md) (Event, Cell test, New battery, Signed record) are written to Cardano Preprod. Implemented in [cardano-log.mjs](../cardano-log.mjs); task list and setup in [member3-tasks.md](member3-tasks.md).

## What the DPP standard gives us

Source: cardano-dpp-standards, `DPP-Blueprint-Cardano-v0.1.md` (draft).

- Event Log = append-only history. Full events stay **off-chain**; the chain holds a fingerprint (Merkle root or hash-chain head) plus a checkpoint number.
- Its sample batch record has `batch_id`, `root`, `index`, `events`, `period`. The `recordEventBatch.js` and Aiken `event_log` code are marked "not production ready" skeletons: no event schema, no metadata label, no library.
- The blueprint says to use a new integer metadata label and not 721. It recommends hash chaining with checkpoints for fewer than 100 events per checkpoint, which fits us.
- Cost is about 0.25 ADA per batch.

So we follow the pattern, not ready-made code: plain transaction metadata, no validator. Library: Mesh SDK 1.9.1 with Blockfrost (the starter already uses Blockfrost for settlement checks).

## Our design

One **log** per donor pack (`pack:A`) and one per new battery (`battery:NB-1`). A log is a chain of transactions: a later batch carries `prev`, the transaction hash of the log's previous batch. The demo writes one batch per log.

All entries sit under one metadata label (placeholder `1984`, team to decide; not 721). Cardano metadata holds only integers, text up to 64 bytes, lists, and maps; no null, booleans, or floats. A 64-hex hash fits in one string; longer values (signature, Masumi identifier) are written as a list of 64-char pieces.

### Stage A: anchor (before hiring)

```json
{ "v": 1, "type": "anchor", "docs": { "packA-invoice-2021-de": "<sha256>", "packA-cell-tests": "<sha256>" } }
```

One transaction per upload batch, covering documents and cell test files. Its hash is the `anchor_tx` of every file in it.

### Stage B: donor log batch (one transaction per donor pack)

```json
{
  "v": 1, "log": "pack:A", "index": 0,
  "entries": [
    { "type": "events", "root": "<sha256 over the pack's verified events>", "count": 5, "anchors": ["<anchor tx>"] },
    { "type": "disassembled", "to": { "NB-1": ["A-M1-C01", "A-M1-C02"] }, "held": ["A-M4-C01", "A-M2-C03"] }
  ],
  "draft": "<sha256 of the paid draft text>",
  "paid": "<Masumi result hash>",
  "masumi": ["<blockchain identifier, 64-char pieces>"],
  "signer": "<company Ed25519 public key>",
  "sig": ["<company signature, 2 pieces>"]
}
```

`root` = sha256 over the sorted hashes of the pack's events (canonical JSON), so the events with their quotes, `module_ids`, and `cell_ids` stay off-chain. `anchors` comes from the draft's `anchor_tx`, or from the anchor journal when the draft has `null`. Reasons for held-back cells stay off-chain in the draft.

### Stage B: new-battery log batch

```json
{
  "v": 1, "log": "battery:NB-1", "index": 0,
  "entries": [{ "type": "assembled_from", "cell_model": "AC-NMC-66P", "chemistry": "NMC", "count": 81, "donors": {
    "pack:A": { "tx": "<tx of pack:A batch>", "test_file": "<sha256 of packA-cell-tests>", "cells": ["A-M1-C01", "…"] }
  } }],
  "draft": "…", "paid": "…", "masumi": ["…"], "signer": "…", "sig": ["…"]
}
```

Cells are grouped per donor, so each donor transaction hash is written once. With 81 cells this transaction is about 2 KB of the 16 KB limit; about 1,670 cells would fit in one batch record (dry-run estimate).

### Passport

```json
{ "v": 1, "type": "passport", "battery": "NB-1", "log_tx": "<tx of the battery log>" }
```

Passport → battery log → `assembled_from` → each donor log → events root and anchored files. A cell can be followed in both directions: the battery log lists it under its donor, and the donor's `disassembled` entry sends it to the battery.

## Signature

[stage-b.mjs](../stage-b.mjs) builds the record `{draft_hash, masumi_result_hash, masumi_blockchain_identifier, changes}`, where `draft_hash` is the sha256 of the exact draft text that was paid for. Member 3's `sign(record)` returns `{signer_public_key, signature}`: Ed25519 over the sha256 of the canonical record including `signer_public_key`.

Every stage B transaction repeats `draft`, `paid`, `masumi`, `signer`, and `sig`. The events roots and cell lists are recomputed from the signed draft, so the signature binds every on-chain batch to the draft without a second signing step. Verification: fetch the draft text, check `signature`, recompute the roots, compare with the chain (`npm run cardano -- trace`).

## Mapping per format

| Our format | On-chain | Off-chain |
|---|---|---|
| Document | `sha256` in an anchor transaction | Original file, Document JSON |
| Cell test file | `sha256` in an anchor transaction, and as `test_file` in `assembled_from` | Signed test file, Cell test rows |
| Event | Inside its pack's `events` root | Full Event JSON with quotes |
| New battery | `assembled_from` cells per donor; `disassembled` in each donor log | `rules`, `held_back` reasons |
| Signed record | `draft`, `paid`, `masumi`, `signer`, `sig` in every stage B batch | Signed record JSON |

Personal data never goes on-chain: only hashes, pack, cell, and battery IDs.

## Open points

- Metadata label: pick one before the first write.
- How the Masumi result hash should link to several logs in one job (ask the Masumi team, task 9). Current answer: `paid` and `masumi` are repeated in every batch of the job.
