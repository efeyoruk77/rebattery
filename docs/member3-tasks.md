# Member 3: Cardano on-chain. Status and setup

Tasks from [team-plan.md](team-plan.md#member-3-cardano-on-chain), with status. Design details are in [cardano-mapping.md](cardano-mapping.md).

| # | Task | Status |
|---|---|---|
| 1 | DPP Event Log pattern, mapping of our formats | Done: [cardano-mapping.md](cardano-mapping.md), for Member 1 to review |
| 2 | Fresh Preprod wallet and Blockfrost key | Done: wallet funded with 5 tADA, Blockfrost connected |
| 3 | Anchor document hashes | Code and tests done, not yet submitted |
| 4 | Company signing (stage B) | Done, tested against [stage-b.mjs](../stage-b.mjs) |
| 5 | Donor event logs ending with "disassembled" | Code and tests done, not yet submitted |
| 6 | New-battery log starting with "assembled from" | Code and tests done, not yet submitted |
| 7 | Passport link | Code and tests done, not yet submitted; `trace` follows it back |
| 8 | Real cost, cells per batch record | Dry-run estimate below; real measurement needs the first submit |
| 9 | Ask Masumi how the result hash links to several logs | Pending |
| 10 | Connect to [stage-b.mjs](../stage-b.mjs), test with the demo draft | Done: connected in [review.mjs](../review.mjs), writes off until enabled |

No transaction has been sent yet. Every TxHash shown in the demo must come from a real run ([Team rules](team-plan.md#team-rules)).

**Blocked on the team:** approval for the first real write, and the metadata label (placeholder `1984` in [cardano-log.mjs](../cardano-log.mjs)).

### Dry-run estimate (Oct 30, demo draft, nothing submitted)

| Transaction | Estimated fee | Size |
|---|---|---|
| Anchor (10 documents, 3 cell test files) | 0.216 tADA | 1,264 bytes |
| Donor log A / B / C | 0.215 tADA each | about 1,245 bytes |
| New battery NB-1 (81 cells) | 0.250 tADA | 2,046 bytes |
| Passport | 0.172 tADA | 261 bytes |
| Full run, 6 transactions | 1.282 tADA | |

These are Mesh's computed fees for the real wallet and current protocol parameters, not measured on-chain fees. The plan's estimate is 0.25 ADA per batch. At 9 bytes per cell ID, about 1,670 cells fit in one batch record under the 16,384-byte transaction limit.

## How it plugs in

| Step | Called by | Function |
|---|---|---|
| Anchor uploaded files | Member 4's upload step | `createCardanoSteps().anchor(files)` returns the files with `anchor_tx` |
| `sign(record)` | [stage-b.mjs](../stage-b.mjs) | Company key from `.local/cardano.env` |
| `writeDonorLogs(signedRecord, draft)` | stage-b.mjs | Returns donor log TxHashes in pack order |
| `writeNewBatteryLog(signedRecord, draft)` | stage-b.mjs | Returns the battery log TxHash, then the passport TxHash |

[review.mjs](../review.mjs) builds `finalize` with these steps, so the Sign button signs and publishes. `stage-b.mjs` keeps its unconnected defaults, so `npm test` never reaches the real chain, and the steps refuse a real chain under `node --test`.

Writes stay off until `CARDANO_WRITES_ENABLED=true` is set in `.env`. Set it only after team approval. A full stage B takes a few minutes, because each transaction waits for its block.

## Files

- [cardano-log.mjs](../cardano-log.mjs): canonical JSON, hashes, and the metadata entries. No network.
- [cardano-sign.mjs](../cardano-sign.mjs): Ed25519 company key, `signRecord`, `signDraft`, `verifySignedRecord`. No network.
- [cardano-writes.mjs](../cardano-writes.mjs): anchor and stage B writes with a resumable journal, and `dryRun`.
- [cardano-steps.mjs](../cardano-steps.mjs): the steps above for stage-b.mjs and the upload step.
- [cardano-trace.mjs](../cardano-trace.mjs): walks passport → battery log → donor logs → anchors and checks them against the draft.
- [cardano-chain.mjs](../cardano-chain.mjs): Mesh SDK wallet and Blockfrost.
- [cardano-cli.mjs](../cardano-cli.mjs): `npm run cardano -- <command>`.

## Setup (one time)

Secrets stay in `.env` and `.local/cardano.env`, both ignored by git.

1. `npm run cardano -- brew` writes `.local/cardano.env` (wallet phrase and company key) and prints the wallet address. Run it once.
2. Create a free Blockfrost project on **Cardano Preprod** and set `BLOCKFROST_API_KEY_PREPROD` in `.env`.
3. Fund the address with about 5 tADA from the Preprod faucet or another wallet of this project. Do not use the Masumi buyer or seller wallets as the log wallet.
4. Check: `npm run cardano -- status`, then `npm run cardano -- dry-run examples/demo-draft.json`.

## Commands

`status`, `dry-run`, `read`, and `trace` only read. `anchor` and `stage-b` send real Preprod transactions; get team approval first.

```sh
npm run cardano -- anchor examples/demo-draft.json                 # 1 tx: every document and cell test file hash
npm run cardano -- sign examples/demo-draft.json masumi.json       # company signs; masumi.json holds {blockchainIdentifier, resultHash}
npm run cardano -- stage-b examples/demo-draft.json                # 3 donor logs, battery log, passport: 5 txs
npm run cardano -- trace <passport txHash> examples/demo-draft.json  # follow the family tree and check it matches
npm run cardano -- read <txHash>                                   # show what was written under our label
```

`anchor` and `stage-b` are resumable. Progress is saved after each step under `.local/`. If a run stops, run the same command again: confirmed transactions are skipped and a submitted one is waited for again. If a submit had an uncertain outcome, the command stops and asks you to check the wallet on preprod.cardanoscan.io first.

## Notes for the team

- Member 1: the mapping in [cardano-mapping.md](cardano-mapping.md) uses the cell formats from the team plan. Events go on-chain only as a hash root per pack.
- Member 4: stage B is connected in `review.mjs`. The upload step can call `anchor(files)`; until then, `npm run cardano -- anchor` anchors the files and stage B finds the anchors in `.local/cardano-anchor.json`.
- `npm audit` grows from 3 findings (2 high, 1 moderate) to 13 (4 high, 9 moderate) with Mesh SDK 1.9.1. Review before any public deployment.
