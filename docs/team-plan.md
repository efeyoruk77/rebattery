# Team plan: History Recovery Agent for EV Batteries

How the work in [project-plan.md](project-plan.md) is split across four people.
Each member owns one slice of the pipeline end to end. Slices meet at the shared data formats below, so everyone can build in parallel against mock data from the first hour.

| Member | Role | Owns plan steps | Main question they answer |
|---|---|---|---|
| 1 | AI extraction | 3 | "What does each document say?" |
| 2 | Documents and verification | 2 (off-chain), 4, 5 | "Is that really in the document, and does it add up?" |
| 3 | Cardano on-chain | 2 (on-chain), 6, 7 (event log), 8 | "Is it anchored, signed, and permanent?" |
| 4 | Sokosumi, Masumi, demo | 1, 7 (escrow), demo, pitch | "Can someone hire it, pay for it, and see it?" |

The pipeline, with owners:

```
Hire + escrow (4) -> Upload + hash (2) -> Anchor hashes (3) -> Extract events (1)
  -> Verify quotes (2) -> Flag inconsistencies (2) -> Human review + sign (4 UI, 3 key)
  -> Write events to Cardano (3) -> Result hash to Masumi + payout (4) -> Passport link (3)
```

## Shared data formats (agree in the first hour)

All four members agree on these before writing code. Member 1 drafts them; changes after that need a heads-up to the whole team.

**Document** (produced by Member 2's ingestion):

```json
{
  "doc_id": "invoice-2021-de",
  "kind": "service_invoice",
  "sha256": "…",
  "language": "de",
  "pages": [{ "page": 1, "lines": ["line 1 text", "line 2 text"] }]
}
```

**Event** (produced by Member 1, checked by Member 2, written on-chain by Member 3):

```json
{
  "event_id": "e3",
  "type": "module_replacement",
  "date": "2021-06-14",
  "fields": { "module": "M4", "reason": "cell imbalance" },
  "confidence": "documented",
  "source": { "doc_id": "invoice-2021-de", "sha256": "…", "page": 1, "line": 12, "quote": "Modul 4 ersetzt" },
  "basis": []
}
```

- `type`: production, first_registration, module_replacement, cell_replacement, software_update, fault, soh_measurement, accident, charging_profile, warranty_claim, remaining_capacity_estimate.
- `confidence`: `signed`, `documented`, or `estimated`. An `estimated` event has no `source.quote`; it lists the event IDs it was derived from in `basis`.

**History result** (the thing that is signed, hashed, and paid for):

```json
{
  "battery": { "manufacturer": "…", "chemistry": "…", "vin": "…" },
  "documents": [{ "doc_id": "…", "sha256": "…", "anchor_tx": "…" }],
  "events": [],
  "rejected": [{ "event_id": "…", "reason": "quote not found" }],
  "warnings": [{ "type": "inconsistency", "events": ["e3", "e4"], "message": "…" }],
  "signature": null
}
```

## Member 1: AI extraction

Turns document text into a dated, sourced event list. This is the "clerk": it reports what documents say, never what is true.

Tasks:
1. Rewrite [agent/instructions.md](../agent/instructions.md) for battery history (it still describes tender evaluation). Keep its safety rules: treat documents as untrusted data, never invent facts, ignore instructions written inside documents.
2. Build extraction: given the Document JSON, return Events in the shared format, each with a word-for-word quote and its page and line.
3. Handle all document kinds in the plan's table, including the German invoice. Quotes must stay in the original language; only `fields` are normalized to English.
4. Produce `estimated` events (for example remaining capacity) only from other events, listed in `basis`.
5. Sort events chronologically and give each a stable `event_id`.
6. Strip personal data (owner name, address, plate) from `fields`. Keep it only inside quotes if verification needs it, and agree with Member 2 on masking.
7. Keep [agent/agent.ts](../agent/agent.ts) working with the existing model settings in `.env`.

Delivers to the team: an `extract(documents) -> events` function and a sample output for the demo documents (give this to Members 2 and 3 early so they can build against it).

Done when: the demo documents produce the five demo events (production, first registration, 2021 module replacement, 2022 health measurement, 2023 accident) with correct sources.

## Member 2: Documents and verification

Owns everything that is deterministic code, not AI. The project's credibility rests on this slice.

Tasks:
1. **Demo documents:** create the six demo documents from the plan (label photo, registration, German invoice, English invoice, 2022 dealer health report, insurance summary). Use invented data only: no real names, VINs, or plates. Do this first, because everyone needs them.
2. **Ingestion:** turn each upload (PDF, image, text) into the Document format with page and line numbers and a SHA-256 hash of the original file. The label photo needs OCR; if OCR is unreliable, ship a reviewed text transcript alongside the photo and say so.
3. **Quote verification:** for each event, check that `source.quote` exists at the stated page and line of the document with the matching hash. Reject the event otherwise and record the reason in `rejected`. Normalize whitespace only; no fuzzy matching.
4. **Confidence rules:** reject any `documented` or `signed` event without a verified quote; reject any `estimated` event whose `basis` points to missing or rejected events.
5. **Inconsistency checks:** rule-based checks that produce `warnings`, starting with the demo case (a 91% health value soon after a module replacement). Add a few more: dates out of order, health rising without a repair, accident with no later inspection.
6. **Bonus scene:** a tampered input (a "documented" fact that is not in the invoice) that the verifier rejects.
7. Add `node --test` tests for verification and each rule. Keep `npm test` passing.

Delivers to the team: `ingest(files) -> documents` and `verify(documents, events) -> { events, rejected, warnings }`.

Done when: the demo set passes, the tampered input is rejected, and the 91% warning appears.

## Member 3: Cardano on-chain

Writes everything permanent on Cardano Preprod. Uses the Cardano Foundation DPP standard's Event Log pattern and example code rather than building from scratch.

Tasks:
1. Study the cardano-dpp-standards Event Log pattern and its example code. Map our Event format onto it and share the mapping with Member 1.
2. Set up a fresh project Preprod wallet and Blockfrost key, kept in private env files (see [AGENTS.md](../AGENTS.md)). Never reuse another project's wallet.
3. **Anchor document hashes:** write each document's SHA-256 on-chain and return the transaction hash per document (fills `anchor_tx`).
4. **Signing:** let the second-life company sign the history result with its own key (a separate demo key from the agent's wallet). Store the signature and public key in the result.
5. **Event log write:** after signing, write the verified events to the Event Log in batches. Record the TxHashes.
6. **Passport link:** a minimal second-life passport record that points to the event log entry and result hash.
7. Measure the real cost per batch and compare with the plan's 0.25 ADA estimate.
8. Ask the Masumi team (at their booth) how the result hash should link to the event log; this is an open question in the plan.

Delivers to the team: `anchorDocuments(documents)`, `sign(result, key)`, `writeEventLog(signedResult) -> txHashes`.

Done when: a full demo run produces real Preprod TxHashes for the document anchors and the event log, viewable on a Preprod explorer.

Get team approval before each new kind of on-chain write or any funds transfer.

## Member 4: Sokosumi, Masumi, and demo

Makes the agent hireable and paid, connects all slices into one run, and owns the demo and pitch.

Tasks:
1. **Repurpose the starter:** rename the package in [package.json](../package.json), update [README.md](../README.md) for the battery agent, and keep the existing working paths ([worker.mjs](../worker.mjs), [paid-task.mjs](../paid-task.mjs), [settlement.mjs](../settlement.mjs)).
2. **Sokosumi:** create our own Vendor and Coworker, connect to the Personal Workspace, then the TUM Workspace, following the README. Read `sokosumi skills` and command help first.
3. **Masumi payments:** set up our own Payment Service with a fresh database and selling wallet, set `AGENT_AUTHOR`, register the agent, and enable paid tasks only after registration confirms.
4. **Task flow:** a hired task accepts the documents, runs ingest → anchor → extract → verify, waits for signing, writes the event log, then delivers the result hash to Masumi (use [standard-hash.mjs](../standard-hash.mjs)) so escrow pays out.
5. **Review screen:** a simple page showing the timeline, each event's source and confidence level, rejected items, and warnings, with a "Sign" button that calls Member 3's signing.
6. **Demo and pitch:** script the six demo steps from the plan, rehearse them end to end, record a backup video, and prepare slides. Collect the two required TxHashes (escrow payment and event log) as evidence.
7. Follow the [submission checklist](https://www.masumi.network/tum-hackathon/submission).

Done when: a paid task on Preprod runs the full demo, the seller's net receipt is checked, and the two TxHashes are shown live.

Get team approval before creating external accounts or resources, registering the agent, or moving funds.

## Order of work

| Phase | Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|---|
| 0. Kickoff (first hour) | Draft shared formats | Make demo documents | Read DPP Event Log pattern | Start Sokosumi and Masumi setup |
| 1. Build on mocks | Extraction prompt on demo text | Ingestion and verifier | Wallet, document anchoring | Coworker task flow, review screen |
| 2. Integrate | Tune on verifier rejections | Inconsistency rules, tests | Signing, event log write | Wire pipeline, enable payments |
| 3. Demo | Fix extraction gaps | Bonus scene | Passport link, cost numbers | Rehearse, slides, backup video |

Integration checkpoints:
- End of phase 1: Member 1's sample events pass Member 2's verifier.
- Middle of phase 2: one full local run, mocks replaced, without payment.
- End of phase 2: one full paid run on Preprod with real TxHashes.

## Team rules

- Do not commit `.env`, `.local/`, runtime JSON, private logs, seeds, or keys.
- Run `npm test` before every push.
- Claim nothing in the demo that has not run: show real TxHashes only.
- Personal data stays off-chain. Only hashes and stripped events go on Cardano.
