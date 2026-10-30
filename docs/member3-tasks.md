# Member 3: Cardano on-chain. Status and setup

Tasks from [team-plan.md](team-plan.md#member-3-cardano-on-chain). Design in [cardano-mapping.md](cardano-mapping.md).

| # | Task | Status |
|---|---|---|
| 1 | Map the formats onto the DPP Event Log pattern | Done: [cardano-mapping.md](cardano-mapping.md), for Member 1 to review |
| 2 | Fresh Preprod wallet and Blockfrost key | Done: log wallet funded with 5 tADA, Blockfrost connected |
| 3 | Anchor documents and every test file in `test_files` | Code and tests done, not yet sent |
| 4 | Company signing | Done, tested against [stage-b.mjs](../stage-b.mjs) |
| 5 | Donor logs ending with `disassembled` (modules per ESS, modules not taken apart, unused cells) | Code and tests done, not yet sent |
| 6 | One ESS log per ESS with cells per module and donor, `health`, `second_life_facility` | Code and tests done, not yet sent |
| 7 | One passport per ESS, QR link for Member 4 | Code and tests done, not yet sent. QR link: `https://preprod.cardanoscan.io/transaction/<passport tx>` |
| 8 | Real cost of a full run | Dry-run estimate below; measured after the first real run |
| 9 | Question for Masumi on linking the result hash to several logs | Open |
| 10 | Connect to stage-b.mjs, test with the demo draft | Done: connected in [review.mjs](../review.mjs), writes off until enabled |

**No transaction has been sent yet.** Blocked on the team: approval for the first real write, and the metadata label (placeholder `1984`).

### Dry-run estimate (Oct 30, demo draft with 5 ESS, nothing sent)

| Transactions | Estimated fee |
|---|---|
| 1 anchor (10 documents, 24 module tests, 21 cell test batches) | 0.346 tADA |
| 3 donor logs | about 0.205 tADA each |
| 5 ESS logs | about 0.238 tADA each |
| 5 passports | about 0.185 tADA each |
| **Full run, 14 transactions** | **3.08 tADA** |

These are Mesh's computed fees for the real wallet, not measured fees. The plan's estimate is 0.25 ADA per batch. The largest transaction is 4,330 of 16,384 bytes. One full run fits the 5 tADA in the wallet; top it up before a second run.

### How it was checked

- `node --test cardano-*.test.mjs`: 34 tests on the demo draft, including stage-b.mjs end to end and every failure path below.
- Mutation check: 24 deliberate bugs (resending a landed transaction, mixing signatures, skipping anchors, no lock, writes without the flag, and more) each made at least one test fail.
- Real Preprod build, not sent: for an anchor, a donor log, an ESS log, and a passport, the metadata decoded from the signed transaction equals what the code wrote, and the precomputed transaction hash matches the signed body.

## How it plugs in

| Step | Called by | Function |
|---|---|---|
| Anchor uploads | Member 4's upload step, or `npm run cardano -- anchor` | `createCardanoSteps().anchor(jobInputOrDraft)` |
| `sign(record)` | stage-b.mjs | Company key from `.local/cardano.env` |
| `writeDonorLogs(signedRecord, draft)` | stage-b.mjs | Donor log TxHashes in pack order |
| `writeNewBatteryLog(signedRecord, draft)` | stage-b.mjs | Per ESS: log TxHash, then passport TxHash |
| QR links | review screen | `createCardanoSteps().passports(signedRecord)` returns `{ESS-1: {txHash, url}, …}` |

`review.mjs` builds `finalize` with these steps. `stage-b.mjs` keeps its unconnected defaults, so `npm test` never reaches the chain, and the steps refuse the real chain under `node --test`. Writes stay off until `CARDANO_WRITES_ENABLED=true` is set in `.env`; set it only after team approval. A full stage B takes several minutes, because each of its 13 transactions waits for its block.

## Safety

- **Resumable, never duplicated.** Each transaction is built and signed first; its hash and signed bytes are saved before sending. A rerun skips confirmed transactions, waits again for sent ones, and resends only the same signed transaction, which cannot land twice. A failure while building saves nothing. Progress lives in `.local/cardano-anchor.json` and `.local/cardano-stage-b-<draft hash>.json`, written atomically.
- **One signed record per run.** A rerun signed with another `changes` text or key is refused, so the logs of one draft never carry two signatures.
- **One writer at a time.** A lock refuses a second Sign click or a CLI run while another write is in progress.
- **Nothing published unanchored.** Stage B stops until every document and test file of the draft is anchored.
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
npm run cardano -- trace <passport tx> examples/demo-draft.json  # follows one ESS back to its documents and checks everything
npm run cardano -- read <txHash>
```

`stage-b` and `trace` also accept the signed record the review screen saves under `.local/signed/`.
