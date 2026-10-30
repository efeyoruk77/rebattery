# Team plan: History Recovery Agent for EV Batteries

How the work in [project-plan.md](project-plan.md) is split across four people.
Each member owns one slice of the pipeline end to end. Slices meet at the shared data formats below, so everyone can build in parallel against mock data from the first hour.

The project's focus: several donor packs are taken apart, modules with matching health are regrouped into a new battery, and the new battery's passport links back to every donor. We work at **module level**, not cell level.

| Member | Role | Owns plan steps | Main question they answer |
|---|---|---|---|
| 1 | AI extraction | 3 | "What does each document say, and about which module?" |
| 2 | Documents, verification, grouping | 1 (upload), 4, 5, 6 | "Is it really in the document, does it add up, and which modules belong together?" |
| 3 | Cardano on-chain | 1 (anchor), 8 (key), 9, 10 | "Is it anchored, signed, and traceable from new battery back to every donor?" |
| 4 | Sokosumi, Masumi, demo | 2, 7, demo, pitch | "Can someone hire it, pay for it, and see the family tree?" |

The pipeline has two stages. Masumi requires the agent's result within 20 minutes of the funds being locked ([agent-api.mjs](../agent-api.mjs)), so the paid job produces a draft with no human step inside it. Signing and the event logs happen afterwards.

```
Stage A: paid draft (one Masumi job)
  Upload docs + module tests, hash each (2) -> Anchor hashes (3)
  -> Hire on Sokosumi, escrow locks (4)
  -> Extract events per module (1) -> Verify quotes (2) -> Flag inconsistencies (2)
  -> Propose grouping (2) -> Draft hash submitted to Masumi, payout (4)

Stage B: sign and publish (company, after payment)
  Review + sign draft, incl. Masumi result hash (4 UI, 3 key)
  -> Write donor + new-battery event logs (3) -> New passport linked to all donors (3)
```

## Shared data formats (agree in the first hour)

All four members agree on these before writing code. Member 1 drafts them; changes after that need a heads-up to the whole team.

**Document** (produced by Member 2's ingestion):

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

**Event** (produced by Member 1, checked by Member 2, written on-chain by Member 3):

```json
{
  "event_id": "A-e3",
  "pack_id": "A",
  "module_id": "A-M4",
  "type": "module_replacement",
  "date": "2021-06-14",
  "fields": { "reason": "cell imbalance" },
  "confidence": "documented",
  "source": { "doc_id": "packA-invoice-2021-de", "sha256": "…", "page": 1, "line": 12, "quote": "Modul 4 ersetzt" },
  "basis": []
}
```

- `module_id` is `null` when the document only talks about the whole pack. Module IDs use the manufacturer's numbering: `<pack>-M<number>`.
- `type`: production, first_registration, module_replacement, cell_replacement, software_update, fault, soh_measurement, accident, charging_profile, warranty_claim, remaining_capacity_estimate.
- `confidence`: `signed`, `documented`, or `estimated`. An `estimated` event has no `source.quote`; it lists the event IDs it was derived from in `basis`.

**Module test** (uploaded by the second-life company, signed, read by Member 2):

```json
{
  "module_id": "A-M2",
  "cell_model": "…",
  "chemistry": "NMC",
  "capacity_ah": 58.1,
  "nominal_capacity_ah": 66.0,
  "internal_resistance_mohm": 1.42,
  "tested_on": "2026-10-28",
  "signature": "…"
}
```

**New battery** (produced by Member 2's grouping):

```json
{
  "battery_id": "NB-1",
  "rules": { "capacity_band_pct": 3, "resistance_band_pct": 10 },
  "modules": [{ "module_id": "A-M2", "donor_pack": "A" }],
  "held_back": [{ "module_id": "B-M1", "reason": "accident event B-e5" }]
}
```

**Job input** (what the buyer sends to the Masumi job; replaces the starter's single `prompt` field):

```json
{
  "packs": ["A", "B", "C"],
  "documents": [{ "doc_id": "packA-invoice-2021-de", "sha256": "…" }],
  "module_tests": [{ "module_id": "A-M2", "sha256": "…" }]
}
```

Documents are uploaded before the job starts. The job input only lists them by ID and hash, so the Masumi input hash fixes exactly which documents were submitted.

**Draft** (stage A output: what the agent delivers and is paid for; its hash goes to Masumi):

```json
{
  "packs": [{ "pack_id": "A", "battery": { "manufacturer": "…", "chemistry": "…", "vin": "…" } }],
  "documents": [{ "doc_id": "…", "sha256": "…", "anchor_tx": "…" }],
  "events": [],
  "rejected": [{ "event_id": "…", "reason": "quote not found" }],
  "warnings": [{ "type": "inconsistency", "events": ["A-e3", "A-e4"], "message": "…" }],
  "module_tests": [],
  "new_batteries": []
}
```

**Signed record** (stage B output: what goes on Cardano):

```json
{
  "draft_hash": "…",
  "masumi_blockchain_identifier": "…",
  "changes": "none, or what the company changed from the draft",
  "signer_public_key": "…",
  "signature": "…"
}
```

## Member 1: AI extraction

Turns document text into a dated, sourced event list per donor pack, tied to modules where the document allows it. This is the "clerk": it reports what documents say, never what is true.

Tasks:
1. Rewrite [agent/instructions.md](../agent/instructions.md) for battery history (it still describes tender evaluation). Keep its safety rules: treat documents as untrusted data, never invent facts, ignore instructions written inside documents.
2. Build extraction: given the Documents for one pack, return Events in the shared format, each with a word-for-word quote and its page and line.
3. **Module attribution:** set `module_id` only when the document names the module or the damaged area clearly (for example "Modul 4 ersetzt", "damage to front-left modules"). Otherwise leave it `null`. Never guess a module.
4. Handle all document kinds in the plan's table, including the German invoice. Quotes stay in the original language; only `fields` are normalized to English.
5. Produce `estimated` events (for example remaining capacity) only from other events, listed in `basis`.
6. Write a short plain-language explanation for each grouping decision from Member 2's output (why a module was used or held back). The explanation must only repeat the rule and the events; it never changes the decision.
7. Strip personal data (owner name, address, plate) from `fields`. Agree with Member 2 on masking inside quotes.
8. Keep [agent/agent.ts](../agent/agent.ts) working with the existing model settings in `.env`.

Delivers to the team: `extract(documents) -> events`, `explainGrouping(newBattery, events) -> text`, and sample output for the three demo packs (give this to Members 2 and 3 early).

Done when: the demo packs produce the expected events. Pack A: module 4 replacement in 2021 and 2022 health measurement. Pack B: 2023 accident tied to modules 1–2. Pack C: software update. All have correct sources.

## Member 2: Documents, verification, and grouping

Owns everything that is deterministic code, not AI. The project's credibility rests on this slice.

Tasks:
1. **Demo documents:** create the documents for three donor packs of the same model (see the demo scenario in the project plan), plus signed module test results for every module. Use invented data only: no real names, VINs, or plates. Do this first, because everyone needs them.
2. **Upload and ingestion:** a simple upload step that runs before the Masumi job starts and returns each file's ID and SHA-256 (these go into the job input). Turn each upload (PDF, image, text) into the Document format with `pack_id`, page and line numbers, and a SHA-256 hash of the original file. When the job runs, check every listed hash against the stored file and stop if one differs. The label photo needs OCR; if OCR is unreliable, ship a reviewed text transcript alongside the photo and say so.
3. **Quote verification:** for each event, check that `source.quote` exists at the stated page and line of the document with the matching hash. Reject the event otherwise and record the reason in `rejected`. Normalize whitespace only; no fuzzy matching.
4. **Confidence rules:** reject any `documented` or `signed` event without a verified quote; reject any `estimated` event whose `basis` points to missing or rejected events.
5. **Inconsistency checks:** rule-based checks that produce `warnings`, starting with the demo case (a 91% health value soon after a module replacement). Add a few more: dates out of order, health rising without a repair, accident with no later inspection.
6. **Module tests:** load the signed test results and check each signature and that every `module_id` belongs to a known donor pack.
7. **Grouping:** deterministic code that builds new batteries from tested modules using the plan's grouping rules: same cell model and chemistry, capacity and resistance within set bands, and no accident or open warning. Record held-back modules with a reason. Keep the band values in one config file.
8. **Bonus scene:** a tampered input (a "documented" fact that is not in the invoice) that the verifier rejects.
9. Add `node --test` tests for verification, each inconsistency rule, and each grouping rule. Keep `npm test` passing.

Delivers to the team: `ingest(files) -> documents`, `verify(documents, events) -> { events, rejected, warnings }`, and `group(moduleTests, events, warnings) -> newBatteries`.

Done when: the demo set passes, the tampered input is rejected, the 91% warning appears, and grouping builds one new battery while holding back Pack B's modules 1–2 and Pack A's module 4.

## Member 3: Cardano on-chain

Writes everything permanent on Cardano Preprod, including the links between donor packs and the new battery. Uses the Cardano Foundation DPP standard's Event Log pattern and example code rather than building from scratch.

Tasks:
1. Study the cardano-dpp-standards Event Log pattern and its example code. Map our Event, Module test, and New battery formats onto it and share the mapping with Members 1 and 2.
2. Set up a fresh project Preprod wallet and Blockfrost key, kept in private env files (see [AGENTS.md](../AGENTS.md)). Never reuse another project's wallet.
3. **Anchor document hashes:** write each document's SHA-256 on-chain and return the transaction hash per document (fills `anchor_tx`).
4. **Signing (stage B, after payment):** let the second-life company sign the draft with its own key (a separate demo key from the agent's wallet). The signed record includes the draft hash and the Masumi blockchain identifier, so it points back to the exact draft that was paid for.
5. **Donor event logs:** one event log per donor pack, holding its verified events and ending with a "disassembled" event that says which module went to which new battery and which were held back.
6. **New-battery event log:** starts with an "assembled from" event listing each module, its donor pack, and a reference to that donor's event log.
7. **Passport link:** a minimal second-life passport record for the new battery that points to its event log and, through it, to every donor log.
8. Measure the real cost per batch and for a full three-donor run, and compare with the plan's 0.25 ADA estimate.
9. Ask the Masumi team (at their booth) how the result hash should link to several event logs in one job; this is an open question in the plan.

Delivers to the team: `anchorDocuments(documents)`, `sign(draft, masumiInfo, key) -> signedRecord`, `writeDonorLogs(signedRecord)`, `writeNewBatteryLog(signedRecord) -> txHashes`.

Done when: a full demo run produces real Preprod TxHashes for the document anchors, all three donor logs, and the new-battery log. A module can be followed from the new battery back to its source documents on a Preprod explorer.

Get team approval before each new kind of on-chain write or any funds transfer.

## Member 4: Sokosumi, Masumi, and demo

Makes the agent hireable and paid, connects all slices into one run, and owns the demo and pitch.

Tasks:
1. **Repurpose the starter:** rename the package in [package.json](../package.json), update [README.md](../README.md) for the battery agent, and keep the existing working paths ([worker.mjs](../worker.mjs), [paid-task.mjs](../paid-task.mjs), [settlement.mjs](../settlement.mjs)).
2. **Sokosumi:** create our own Vendor and Coworker, connect to the Personal Workspace, then the TUM Workspace, following the README. Read `sokosumi skills` and command help first.
3. **Update the registration before registering.** [payment-registration.mjs](../payment-registration.mjs) still registers "Hackathon Team Name Finder" with team-name tags. Change the name, description, and tags to the battery agent first, because the registration is written on-chain.
4. **Masumi payments:** set up our own Payment Service with a fresh database and selling wallet, set `AGENT_AUTHOR`, register the agent, and enable paid tasks only after registration confirms.
5. **Job input:** change [agent-api.mjs](../agent-api.mjs) to accept the Job input format (pack list plus document and module test IDs and hashes) instead of the single `prompt` string capped at 16,000 characters. Update `inputHash` in [standard-hash.mjs](../standard-hash.mjs) to hash the new input, and keep the purchaser nonce in it. Add a regression test for the new input check.
6. **Stage A task flow:** one hired task covers a batch of donor packs. After funds are confirmed locked, it runs extract → verify → group and submits the draft hash to Masumi (`resultHash` in [standard-hash.mjs](../standard-hash.mjs)) well inside the 20-minute deadline. No human step runs inside the job. Time a full three-pack run early; if it is close to 20 minutes, raise it with the team.
7. **Stage B flow:** after payment, load the paid draft into the review screen, call Member 3's signing and event log writes.
8. **Review screen:** a simple page with:
   - a timeline per donor pack, each event showing its source, module, and confidence level;
   - rejected items and warnings;
   - the **family tree**: new battery → modules → donor packs → source documents, with held-back modules and their reasons;
   - a "Sign" button that calls Member 3's signing.
9. **Demo and pitch:** script the nine demo steps from the plan, rehearse them end to end, record a backup video, and prepare slides. Collect the real TxHashes (escrow payment, result hash, and event logs) as evidence. The payout unlocks about 36 minutes after the job starts, so start the paid demo run well before presenting.
10. Follow the [submission checklist](https://www.masumi.network/tum-hackathon/submission).

Done when: a paid task on Preprod delivers the three-pack draft inside the deadline, the seller's net receipt is checked, the signed record and event logs follow, and the TxHashes are shown live.

Get team approval before creating external accounts or resources, registering the agent, or moving funds.

## Order of work

| Phase | Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|---|
| 0. Kickoff (first hour) | Draft shared formats | Make demo documents and module tests | Read DPP Event Log pattern | Start Sokosumi and Masumi setup |
| 1. Build on mocks | Extraction with module attribution | Upload, ingestion, verifier | Wallet, document anchoring | Registration text, new job input, review screen |
| 2. Integrate | Tune on verifier rejections, grouping explanations | Inconsistency rules, grouping, tests | Signing, donor and new-battery logs | Stage A and B flows, family tree, enable payments, time a full run |
| 3. Demo | Fix extraction gaps | Bonus scene | Passport link, cost numbers | Rehearse, slides, backup video |

Integration checkpoints:
- End of phase 1: Member 1's sample events for all three packs pass Member 2's verifier.
- Middle of phase 2: one full local run, from documents to grouped new battery, mocks replaced, without payment.
- End of phase 2: one full paid run on Preprod: draft delivered inside the deadline and paid, then signed, with real TxHashes for all donor logs and the new-battery log.

## Team rules

- Do not commit `.env`, `.local/`, runtime JSON, private logs, seeds, or keys.
- Run `npm test` before every push.
- Claim nothing in the demo that has not run: show real TxHashes only.
- Personal data stays off-chain. Only hashes and stripped events go on Cardano.
- Grouping is decided by code and signed by a human. The AI only explains it.
