# Paid runs (Oct 31, Preprod)

## Paid run through Sokosumi (TUM Workspace)

**Result: it worked end to end, through the route the hackathon asks for.** A task in the TUM Workspace hired our Coworker; Sokosumi paid 1 test USDM into Masumi's escrow without any manual step; the agent delivered the draft before the deadline; the seller wallet received the full 1 test USDM. Sokosumi's own receipt reports `settled: true`, and the net amount was checked on Blockfrost.

| | |
|---|---|
| Sokosumi task | `01a190fe-859d-75e5-be4b-3ad10177652d` (TUM Workspace, status `COMPLETED`) |
| Coworker | `01a18e63-a950-73ac-9195-53260585528f` (EV Battery History Recovery) |
| Escrow lock (`FundsLocked`) | [1767ef45…](https://preprod.cardanoscan.io/transaction/1767ef455ad0536a245a1f7dde2234596c1de1213ec5861a6eb3ffa98b465f46) |
| Result hash on-chain (`ResultSubmitted`) | [e0d086e0…](https://preprod.cardanoscan.io/transaction/e0d086e0b928b7437cc9d5d274b8a33ef99c41fdf361ca55fcfd2a0612f2972f), result hash `63a675fe…72ed` |
| Payout (`Withdrawn`) | [ff813786…](https://preprod.cardanoscan.io/transaction/ff813786651e7f0af39013d24c2d4c2707067a11582160de4fb247b627f8ef07), confirmed 09:55 |
| Seller receipt | `sokosumi runtime receipt`: `settled: true`; 1 test USDM net at the seller address (Core/MPS withdrawal hash matched with Blockfrost inputs and outputs) |

Timeline (local time): 09:06 task created and payment requested by the worker → 09:09 funds locked (Sokosumi paid from the Workspace's credits, no approval step) → 09:14 result hash on-chain (deadline 09:26) → 09:18 task `COMPLETED` with the draft → 09:42 payout allowed → 09:55 payout confirmed (the payment service sends payouts in batches) → 09:57 worker verified the receipt.

The unpaid task `01a190f9-f34a-735b-a5ec-1dc8b7a5ede8` in the same Workspace also completed, and its follow-up comment ("Why was module A-M4 not taken apart, and which quote decided it?") was answered from the draft, quoting A-e4 and A-e5.

Fixed on the way: the worker could not start the Sokosumi CLI on Windows, and follow-ups on draft tasks were skipped. Both fixed in `cb87076`.

## First paid run, directly through Masumi

**Result: it worked end to end.** A buyer paid 1 test USDM into Masumi's escrow, our agent did the work with the real model, put its result hash on-chain before the deadline, and the seller wallet received the full 1 test USDM. Every transaction below was checked on Blockfrost.

This run went directly through Masumi, without Sokosumi: our payment service's own buyer wallet hired our own agent. The Sokosumi route is still waiting for TUM Workspace access (open problem #1). Run on Member 4's machine.

## Timeline (local time, CET)

| Time | Step | Transaction | Block | Fee |
|---|---|---|---|---|
| 03:43 | Job started through the agent API; the agent created its payment request (1 test USDM, pay by 03:53, result by 04:03) | | | |
| 03:48 | Buyer locked 1 test USDM in the escrow contract (`FundsLocked`) | [caf71d8e…3033](https://preprod.cardanoscan.io/transaction/caf71d8e14c7416831d9438b1d762bd46baa44ed004756714292c132abb93033) | 5355478 | 0.205717 tADA |
| 03:49–03:54 | Agent saw the locked funds and ran stage A with Gemini `gemini-3.5-flash`: AI extraction, verification, warnings, module screening, ESS grouping, AI explanation | | | |
| 03:54 | Agent put the result hash on-chain (`ResultSubmitted`), 9 minutes before the deadline | [86da2e43…a3e7](https://preprod.cardanoscan.io/transaction/86da2e43730532f734c7581a5e2f5041afeda260c4528849934b19cf73dba3e7) | 5355496 | 0.709042 tADA |
| 04:19 | Payout allowed (unlock time) | | | |
| 05:45 | Seller collected the payment (`Withdrawn`): **1 test USDM net to the seller wallet** | [ba7dd0bb…695e](https://preprod.cardanoscan.io/transaction/ba7dd0bb7ec786b3ae30fe671aa472aaffa983c03b1671477767185ffedf695e) | 5355787 | 0.673175 tADA |

The payout came 86 minutes after it was allowed because the payment service was stopped from 04:06 to 05:40 (see "What went wrong"). Once restarted, it found the due payment and paid out within 5 minutes. The Masumi fee rate on this payment source is 0, so the seller received the full price.

## What the agent delivered

The paid draft (job `626a562c-25e8-400e-bf61-e9a32157a91a`) on the demo documents:

- 11 events, all verified against their source quotes; 0 rejected claims
- Both warnings: 91 % health after the module 4 replacement (`soh_after_replacement`), accident without a later inspection (`accident_without_inspection`)
- 5 ESS units of 48 cells: ESS-1 86.5 %, ESS-2 87.9 %, ESS-3 88.5 %, ESS-4 88.9 %, ESS-5 89.4 %; 3 modules not taken apart and 12 cells not used
- An AI explanation for all 5 ESS units, the 3 held-back modules, and 3 cell groups

Integrity checks:

- The result hash on-chain (`36b6fb12…f024`) equals the hash of the delivered draft, and the input hash (`a459c73d…7a51`) equals the hash of the job input, which lists every uploaded document and test file by SHA-256.
- The seller's net receipt was computed from the payout transaction's inputs and outputs at the seller address (Blockfrost), not taken from the payment service.

The draft is on Member 4's review screen as "Masumi job 626a562c…". It is a paid draft, so the Sign button can publish it on Cardano once `CARDANO_WRITES_ENABLED=true` is set (not done in this run).

## Costs

| Paid by | Amount |
|---|---|
| Buyer | 1 test USDM (price) + 0.205717 tADA (lock fee) |
| Seller | 0.709042 tADA (result) + 0.673175 tADA (payout) |

## What went wrong, and what we changed

1. **The first payment request was refused** ("sellerReturnAddress must be a Cardano base or enterprise address"). The payment service setup had an empty collection address setting, stored as `""` instead of "none". Nothing was paid or sent. Fixed by clearing the collection address on both wallets through the payment service's own API (`PATCH /api/v1/wallet`, `newCollectionAddress: null`) and commenting out the empty settings in the service configuration.
2. **The payment service stopped at 04:06**, while the laptop lid was closed, 13 minutes before the payout time. Services started from a Claude Code session stop when that session is paused. The money stayed safe in escrow; after a restart the payout went through. **For the demo: start every service yourself in a VS Code terminal and keep the laptop awake and open during a paid run.**
3. **The watch script gave up too early** after the long stop. It now keeps waiting whenever the result is on-chain, because the seller can still collect late.

## Repeat it

```sh
# terminals: npm start, npm run api, and the payment service (.local\start-mps.ps1)
node --env-file=.env --env-file=.local/mps.env masumi-self-test.mjs start   # uploads the demo batch, starts a job, pays into escrow
node --env-file=.env --env-file=.local/mps.env masumi-self-test.mjs watch   # follows it to the payout and checks the seller's net receipt
```

The buyer wallet needs test ADA and test USDM from the [Masumi dispenser](https://dispenser.masumi.network). Each run sends real Preprod transactions; get team approval first. A completed run must be moved away (`.local/masumi-self-test.json`) before starting the next.

## Still not covered

- The same flow through a **Sokosumi task** (needs TUM Workspace access, open problem #1).
- **Signing this paid draft** and writing its event logs and passports on Cardano from the review screen (the code is tested and Member 3 did a full unpaid test run; turning on writes is a team decision for the demo).
