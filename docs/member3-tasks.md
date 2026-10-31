# Member 3: Cardano on-chain. Status and setup

Tasks from [team-plan.md](team-plan.md#member-3-cardano-on-chain). Design in [cardano-mapping.md](cardano-mapping.md).

| # | Task | Status |
|---|---|---|
| 1 | Map the formats onto the DPP Event Log pattern | Done: [cardano-mapping.md](cardano-mapping.md), for Member 1 to review |
| 2 | Fresh Preprod wallet and Blockfrost key | Done: log wallet funded with 5 tADA (1.92 tADA left after the first run), Blockfrost connected |
| 3 | Anchor documents and every test file in `test_files` | Done, sent Oct 31 (see below) |
| 4 | Company signing | Done, tested against [stage-b.mjs](../stage-b.mjs) |
| 5 | Donor logs ending with `disassembled` (modules per ESS, modules not taken apart, unused cells) | Done, sent Oct 31 |
| 6 | One ESS log per ESS with cells per module and donor, `health`, `second_life_facility` | Done, sent Oct 31 |
| 7 | One passport per ESS, QR link for Member 4 | Done, sent Oct 31. QR link: `https://preprod.cardanoscan.io/transaction/<passport tx>` |
| 8 | Real cost of a full run | Done: measured 3.081118 tADA for 14 transactions, equal to the dry run |
| 9 | Question for Masumi on linking the result hash to several logs | Open |
| 10 | Connect to stage-b.mjs, test with the demo draft | Done: connected in [review.mjs](../review.mjs), writes off until enabled |

### First real run (Oct 31, Preprod, label `1542`, marked `unpaid-test-run`)

`anchor`, `sign-test`, `stage-b`, then `trace` on the ESS-1 passport: all 3 donors and the anchor found, every cell linked both ways, and "on-chain records match the draft and signed record". Measured fees from Blockfrost.

| Log | Transaction | Fee (tADA) |
|---|---|---|
| anchor 1 | [aeaa7cd7…d646](https://preprod.cardanoscan.io/transaction/aeaa7cd7c31f4641e524d2184af8f6521b9804f17a0eb1c05021189df981d646) | 0.345901 |
| pack:A | [2a30a066…b350](https://preprod.cardanoscan.io/transaction/2a30a0660c813802d89945dce27d3ad6432608df31460a97995c242d4a16b350) | 0.204353 |
| pack:B | [95b9a674…66dc](https://preprod.cardanoscan.io/transaction/95b9a6749a96ac723f035e95ec228af9ef23cc0549bdf21a06ec17a9ce8f66dc) | 0.206113 |
| pack:C | [c201a0c9…8dec](https://preprod.cardanoscan.io/transaction/c201a0c952b4f55934148dff36f35de78696f39880834d41a7700521f3f98dec) | 0.206597 |
| battery:ESS-1 | [41e9bdb0…5e4e](https://preprod.cardanoscan.io/transaction/41e9bdb04b14d302d061a2b5824f95c1b729abccd88c32fc2de77cb14d385e4e) | 0.237749 |
| passport:ESS-1 | [bb1c267b…f865](https://preprod.cardanoscan.io/transaction/bb1c267b3f9143091a3418a1be4d8928c139fc5a3d9fd854c2842d05cbe9f865) | 0.184949 |
| battery:ESS-2 | [ee7d3f93…1b7b](https://preprod.cardanoscan.io/transaction/ee7d3f9383af11f0e8cc3bc75660d95b1eea060159936399f99a3f5c5dd01b7b) | 0.238541 |
| passport:ESS-2 | [4e64eb37…8292](https://preprod.cardanoscan.io/transaction/4e64eb37ecc898da4410f0cf4f91df1a9b14bd1eff86768f9de725da81fa8292) | 0.184949 |
| battery:ESS-3 | [a2082c78…0d42](https://preprod.cardanoscan.io/transaction/a2082c78e56c5406856f2db967bcb49361bf12d5b57f4aa2b24f1cae7d6e0d42) | 0.239641 |
| passport:ESS-3 | [853d8ef1…28f7](https://preprod.cardanoscan.io/transaction/853d8ef1c085f2470b5e2890d8e4bf03ec79da4e99d1877583ec9e5d6e4b28f7) | 0.184993 |
| battery:ESS-4 | [b72f4c3f…f4a4](https://preprod.cardanoscan.io/transaction/b72f4c3f217ae8537fc8aaf4107ab689d87d9e093c9684a4f763c8c67931f4a4) | 0.239069 |
| passport:ESS-4 | [0f4256fd…0ff1](https://preprod.cardanoscan.io/transaction/0f4256fd170491f4f6690d7614fc06bcb0057b6aab2248cbc05de310e5180ff1) | 0.184949 |
| battery:ESS-5 | [3090d13e…637a](https://preprod.cardanoscan.io/transaction/3090d13e6662ac88de14c59ec4e6873629c39292e5dc3d3c005158e1b689637a) | 0.238321 |
| passport:ESS-5 | [f2c7849e…732c](https://preprod.cardanoscan.io/transaction/f2c7849e5c13eee71cd17dcd4aa92d215f70bc81b2001297ce2e775f1934732c) | 0.184993 |
| **Total, 14 transactions** | | **3.081118** |

The first attempt at pack:C was refused ("All inputs are spent"): Blockfrost had confirmed pack:B but still listed the input pack:B spent, and pack:C was built on it. Refused transactions cost nothing. It was removed with `drop-unsent`, and `waitConfirmed` now also waits until the wallet view holds the new change ([cardano-chain.mjs](../cardano-chain.mjs)).

### Dry-run estimate (Oct 30, demo draft with 5 ESS, nothing sent; rerun Oct 31 with the AI explanation in the draft: same 3.081118 tADA)

| Transactions | Estimated fee |
|---|---|
| 1 anchor (10 documents, 24 module tests, 21 cell test batches) | 0.346 tADA |
| 3 donor logs | about 0.205 tADA each |
| 5 ESS logs | about 0.238 tADA each |
| 5 passports | about 0.185 tADA each |
| **Full run, 14 transactions** | **3.08 tADA** |

These are Mesh's computed fees for the real wallet, not measured fees. The plan's estimate is 0.25 ADA per batch. The largest transaction is 4,330 of 16,384 bytes. One full run fits the 5 tADA in the wallet; top it up before a second run.

### How it was checked

- `node --test cardano-*.test.mjs`: 44 tests on the demo draft, including stage-b.mjs end to end, every failure path below, and loading the CLI and the review screen.
- Mutation check: 30 deliberate bugs (resending a landed transaction, never resending a dropped one, mixing signatures, skipping anchors or validation, no lock, writes without the flag, trace ignoring a field or the company key, and more) each made at least one test fail.
- Real Preprod build, not sent: for an anchor, a donor log, an ESS log, and a passport, the metadata decoded from the signed transaction equals what the code wrote, and the precomputed transaction hash matches the signed body.

## How it plugs in

| Step | Called by | Function |
|---|---|---|
| Anchor uploads | Member 4's upload step, or `npm run cardano -- anchor` | `createCardanoSteps().anchor(jobInputOrDraft)` |
| `sign(record)` | stage-b.mjs | Company key from `.local/cardano.env` |
| `writeDonorLogs(signedRecord, draft)` | stage-b.mjs | Donor log TxHashes in pack order |
| `writeNewBatteryLog(signedRecord, draft)` | stage-b.mjs | Per ESS: log TxHash, then passport TxHash |
| QR links | review screen | The `/api/sign` response now carries `passports: {ESS-1: {txHash, url}, …}`; also `createCardanoSteps().passports(signedRecord)` |

`review.mjs` builds `finalize` with these steps. `stage-b.mjs` keeps its unconnected defaults, so `npm test` never reaches the chain, and the steps refuse the real chain under `node --test`. Writes stay off until `CARDANO_WRITES_ENABLED=true` is set in `.env`; set it only after team approval. A full stage B takes several minutes, because each of its 13 transactions waits for its block.

## Safety

- **Resumable, never duplicated.** Each transaction is built and signed first; its hash and signed bytes are saved before sending. A rerun skips confirmed transactions, waits again for sent ones (and resends one the mempool dropped), and resends only the same signed transaction, which cannot land twice. A failure while building saves nothing. If a saved transaction can never land (its inputs were spent elsewhere), `npm run cardano -- drop-unsent <journal> <key>` removes it, but only when the network does not know it. Progress lives in `.local/cardano-anchor.json` and `.local/cardano-stage-b-<draft hash>.json`, written atomically.
- **One signed record per run.** A rerun signed with another `changes` text or key is refused, so the logs of one draft never carry two signatures. The journal keeps the signed record, so `stage-b <draft> resume` finishes a run even if the signed file is lost.
- **One writer at a time.** A lock refuses a second Sign click or a CLI run while another write is in progress.
- **Nothing sent until the whole run is valid.** Stage B stops until every document and test file is anchored under its own id and hash, and every donor, ESS, and passport entry passes the metadata and size checks. Anchoring again only adds files that are new or changed.
- **No secrets in errors.** Errors from Mesh and Blockfrost become plain messages with the Blockfrost key removed.

## Setup (one time)

1. `npm run cardano -- brew` writes `.local/cardano.env` (wallet phrase and company key) and prints the wallet address.
2. Create a free Blockfrost project on **Cardano Preprod** and set `BLOCKFROST_API_KEY_PREPROD` in `.env`.
3. Fund the address with about 5 tADA. Do not use the Masumi buyer or seller wallets as the log wallet.
4. Check: `npm run cardano -- status`, then `npm run cardano -- dry-run examples/demo-draft.json`.

## Commands

`status`, `dry-run`, `read`, and `trace` only read. `anchor` and `stage-b` send real transactions: get team approval first.

```sh
npm run cardano -- anchor examples/demo-draft.json          # anchors every document and test file
npm run cardano -- sign-test examples/demo-draft.json       # test run without payment: on-chain masumi says "unpaid-test-run"
npm run cardano -- sign <draft> masumi.json                 # paid run: {blockchainIdentifier, resultHash, nonce} or hashScheme "task"; checked like stage-b.mjs
npm run cardano -- stage-b examples/demo-draft.json         # 3 donor logs, then per ESS its log and passport; prints the QR links
npm run cardano -- stage-b examples/demo-draft.json resume  # finish a run with the signed record kept in its journal
npm run cardano -- trace <passport tx> examples/demo-draft.json  # follows one ESS back to its documents, checks everything, and that the company key signed
npm run cardano -- read <txHash>
```

`stage-b` and `trace` also accept the signed record the review screen saves under `.local/signed/`.
