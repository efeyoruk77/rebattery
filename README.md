# EV Battery History Recovery

An AI agent on Sokosumi that rebuilds the history of old EV batteries that never had a digital passport, and proposes how to regroup their cells into second-life home storage units. Every finding is checked against its source document. The final record goes on Cardano, and each new storage unit gets a passport with a QR code.

Built for the TUM Blockchain & AI Hackathon on Cardano Preprod, with Masumi payments.

## The problem

From 18 February 2027, every EV battery and every storage battery over 2 kWh sold in the EU needs a digital battery passport (Regulation (EU) 2023/1542, Article 77). Batteries made before that date have none.

Second-life companies take old EV packs apart and combine matching cells into new energy storage systems (ESS). Each ESS is a new battery on the market, so it needs its own passport that links to the passports of all its donor batteries (Article 77(7)). But the donors have no passports. Their history exists only in scattered documents: service invoices, health reports, insurance records.

## Who uses it

| User | What they get |
|---|---|
| Second-life company | A sourced history for each donor pack, a checked plan for which modules to take apart and which cells to combine, and a draft ready to sign |
| Buyer of a second-life battery | A passport that shows where each cell came from and what happened to it, with the evidence |
| Recycling facility | Chemistry and accident history per module and cell, for safe handling |

## How it works

**Stage A: paid draft (one Sokosumi/Masumi job, no human step)**

1. The company uploads the documents for each donor pack, plus signed module and cell test results. The job input lists every file by SHA-256, so the job's input hash fixes exactly which files were submitted.
2. The company hires the agent on Sokosumi. The fee is locked in escrow on Cardano.
3. **AI extracts events** from the documents: each event points to its page, line, and exact quote, and to a module or cell when the document names one.
4. **Code verifies** that every quote really is in the document. Anything not found is rejected.
5. **Code flags contradictions**, for example a high health value right after a module replacement.
6. **Code screens modules and groups cells.** Modules with an accident or open warning are held back. Cells of cleared modules are combined into 48-cell ESS units by measured capacity and resistance. The AI explains each decision but does not make it.
7. The draft's hash is submitted on-chain and the escrow pays the agent.

**Stage B: sign and publish (the company, after payment)**

8. The company reviews the draft on the review screen and signs it with its own key.
9. Each donor's event log and each ESS's "assembled from" record is written to Cardano (metadata label `1542`).
10. Each ESS gets a passport, opened by a QR code, that traces back to every donor pack and source document.

**The AI is a clerk, not a witness.** It only reports what a document says. Code checks the quotes, rules decide the grouping, and a person signs. Details: [docs/project-plan.md](docs/project-plan.md).

## Example: the demo batch

Input: three 2020 EV packs (8 modules × 12 cells each), with invented sample documents in [battery/demo/](battery/demo/):

- **Pack A:** label, registration, a German invoice for a 2021 module 4 replacement, a 2022 dealer health report
- **Pack B:** label, registration, an insurance record for a 2023 accident near modules 1–2
- **Pack C:** label, registration, an English invoice for a software update

Output (the draft in [examples/demo-draft.json](examples/demo-draft.json)):

- 11 events, all verified against their quotes
- 1 planted claim rejected (A-x1): its quote is not in the invoice it cites
- 2 warnings: 91 % health reported after the module 4 replacement; accident with no later inspection
- 3 modules held back (A-M4, B-M1, B-M2), 12 cells left out with a reason
- 5 ESS units of 48 cells, at 86.5 % to 89.4 % health
- An AI explanation for every ESS, held-back module, and cell group

**How we checked it:** `node --env-file=.env e2e.mjs` runs the whole backend with the real model and compares the result with the reference: all 11 expected events, both warnings, the same 5 ESS units and held-back items, 12/12 checks. A tampered claim (`node battery/run-demo.mjs --tampered`) is rejected because its quote is not in the invoice.

## Evidence

All on Cardano **Preprod**.

**Sokosumi task with follow-up (unpaid test, TUM Workspace)**

- Coworker: *EV Battery History Recovery* (Coworker ID: `01a18e63-a950-73ac-9195-53260585528f`)
- Task `01a190f9-f34a-735b-a5ec-1dc8b7a5ede8`: demo job input → `COMPLETED` in 3 minutes (11 events, 2 warnings, 5 ESS, explanation)
- Follow-up comment: "Why was module A-M4 not taken apart, and which quote decided it?" The agent answered from the draft, quoting events A-e4 and A-e5.

**Paid run through Masumi (complete, seller paid)**

Our payment service's buyer wallet hired our agent directly through Masumi (job `626a562c-25e8-400e-bf61-e9a32157a91a`):

| Step | Transaction |
|---|---|
| Agent registered in the Masumi registry | [04dd6863…c8f2](https://preprod.cardanoscan.io/transaction/04dd6863747ada3997441e5b1d7fae6c18bee51d9b6b88d6736d8dcbd8d3c8f2) |
| Buyer locked 1 test USDM in escrow | [caf71d8e…3033](https://preprod.cardanoscan.io/transaction/caf71d8e14c7416831d9438b1d762bd46baa44ed004756714292c132abb93033) |
| Result hash on-chain, 9 minutes before the deadline | [86da2e43…a3e7](https://preprod.cardanoscan.io/transaction/86da2e43730532f734c7581a5e2f5041afeda260c4528849934b19cf73dba3e7) |
| Payout: **1 test USDM net to the seller wallet** (checked from the transaction's inputs and outputs) | [ba7dd0bb…695e](https://preprod.cardanoscan.io/transaction/ba7dd0bb7ec786b3ae30fe671aa472aaffa983c03b1671477767185ffedf695e) |

Full report, costs, and what went wrong: [docs/paid-run-report.md](docs/paid-run-report.md).

**Paid Sokosumi task (complete, seller paid)**

Task `01a190fe-859d-75e5-be4b-3ad10177652d` in the TUM Workspace, hired and paid through Sokosumi on Oct 31:

| Step | Transaction |
|---|---|
| Sokosumi locked 1 test USDM in escrow | [1767ef45…5f46](https://preprod.cardanoscan.io/transaction/1767ef455ad0536a245a1f7dde2234596c1de1213ec5861a6eb3ffa98b465f46) |
| Result hash on-chain | [e0d086e0…972f](https://preprod.cardanoscan.io/transaction/e0d086e0b928b7437cc9d5d274b8a33ef99c41fdf361ca55fcfd2a0612f2972f) |
| Payout: **1 test USDM net to the seller wallet** (block 5356477) | [ff813786…ef07](https://preprod.cardanoscan.io/transaction/ff813786651e7f0af39013d24c2d4c2707067a11582160de4fb247b627f8ef07) |

Seller receipt from Sokosumi (`sokosumi --preprod runtime receipt 01a190fe-859d-75e5-be4b-3ad10177652d --coworker-id 01a18e63-a950-73ac-9195-53260585528f --json`):

```json
{
  "claimStatus": "PURCHASED",
  "onChainState": "Withdrawn",
  "settled": true,
  "txHash": "ff813786651e7f0af39013d24c2d4c2707067a11582160de4fb247b627f8ef07"
}
```

The worker also checked the payout transaction on Blockfrost and found 1 test USDM net at the seller address.

**Stage B on-chain test write (unpaid test run)**

One full write of the demo draft: 14 transactions for 3.08 tADA. That covers the document anchor [aeaa7cd7…d646](https://preprod.cardanoscan.io/transaction/aeaa7cd7c31f4641e524d2184af8f6521b9804f17a0eb1c05021189df981d646), 3 donor logs, 5 ESS logs, and 5 passports. The ESS-1 passport [bb1c267b…f865](https://preprod.cardanoscan.io/transaction/bb1c267b3f9143091a3418a1be4d8928c139fc5a3d9fd854c2842d05cbe9f865) traces back to all 3 donors. All transaction hashes are in [docs/member3-tasks.md](docs/member3-tasks.md).

Every passport passes four checks against the chain:

1. The passport, its ESS log, and every donor log are found on Cardano.
2. Every donor log sends its modules to this ESS, so the link holds in both directions.
3. The cells, health, events, held-back items, and every file fingerprint match the draft that was signed: [examples/demo-onchain-draft.json](examples/demo-onchain-draft.json). Its SHA-256 equals the `draft_hash` on-chain.
4. **The company signature verifies** (Ed25519 over the signed record), and every donor and ESS log carries the same signature. The signed record is [examples/demo-onchain-signed.json](examples/demo-onchain-signed.json), rebuilt only from the public on-chain logs, so anyone can repeat the check.

`examples/demo-draft.json` was extended after this run (pack model, serial number, VIN), so it no longer matches these records. To trace them, use the on-chain copy: `npm run cardano -- trace <passport tx> examples/demo-onchain-draft.json`.

## Try it in the browser

**Public site, nothing to install:** https://efeyoruk77.github.io/Afterlife/

- [Review screen](https://efeyoruk77.github.io/Afterlife/) (read-only): the paid Sokosumi draft and the demo drafts, with timelines, warnings, held-back items, and ESS cards
- [Battery passports](https://efeyoruk77.github.io/Afterlife/passports.html): one page per ESS from the Cardano test run, what the QR code on a unit opens. Each one follows its cells back to every donor pack, event, quote, and file fingerprint, checked against the chain when the site was built, including the company signature. The list shows each unit's QR code.

Rebuild it with `node --env-file-if-exists=.env passport-site.mjs`, then push `site/` to the `gh-pages` branch.

**Locally,** with the services running (see setup below), run `npm run review`:

- http://127.0.0.1:21952: the **review screen**, with the **New job** page (key `0`) for uploading a batch and copying the job input, plus timelines, warnings, ESS passport cards with QR codes, and **Sign and publish**
- http://127.0.0.1:21952/status: what is running, with Masumi registration, wallet balance, Sokosumi tasks, and links to escrow, result, and payout transactions

To hire the agent: on **New job**, use the demo batch and copy the job input. Then, in the TUM Sokosumi Workspace, create a task with the Coworker **EV Battery History Recovery**, paste the job input as the description, and pay.

## How the agent is built

| Part | Files |
|---|---|
| Model instructions (extraction and grouping explanation) | [agent/instructions.md](agent/instructions.md) |
| AI extraction, one pack per model call, with retries | [battery/extract.mjs](battery/extract.mjs) |
| Quote verification and contradiction rules (no AI) | [battery/verify.mjs](battery/verify.mjs), [battery/rules.mjs](battery/rules.mjs) |
| Signed test checks, module screening, cell grouping (no AI) | [battery/tests.mjs](battery/tests.mjs), [battery/group.mjs](battery/group.mjs), limits in [battery/config.mjs](battery/config.mjs) |
| Stage A draft and job input | [draft.mjs](draft.mjs), [job-input.mjs](job-input.mjs), [upload.mjs](upload.mjs) |
| Sokosumi worker and paid tasks | [worker.mjs](worker.mjs), [paid-task.mjs](paid-task.mjs) |
| Masumi agent API | [agent-api.mjs](agent-api.mjs) |
| Stage B signing and Cardano writes | [stage-b.mjs](stage-b.mjs), [cardano-writes.mjs](cardano-writes.mjs), [cardano-cli.mjs](cardano-cli.mjs) |
| Review screen, status page, passport site | [review.mjs](review.mjs), [status.mjs](status.mjs), [passport-site.mjs](passport-site.mjs) |

Shared data formats: [docs/team-plan.md](docs/team-plan.md). Code conventions: [battery/README.md](battery/README.md). On-chain format: [docs/cardano-mapping.md](docs/cardano-mapping.md).

## Limits and steps that need a person

- **The system proves what a document says, not that the document is true.** Documents signed by the service shop or manufacturer lower this risk.
- **A person must sign.** The company reviews the draft and signs it with its own key before anything about the batteries is written on-chain.
- **Uploads only work on the operator's machine.** An outside company cannot upload files yet; the job input points to files stored on the machine that runs the agent.
- **The demo data is invented.** Grouping limits are placeholders; real limits depend on the cell model.
- **Legal acceptance is open.** The regulation does not say whether a rebuilt history may replace a missing original passport. The demo QR codes are not yet ISO/IEC 15459 identifiers.
- **AI limits** (input size, model quota, the 20-minute job deadline) can shorten the explanation for large batches. The grouping itself is decided by code and is always complete.

More: [docs/project-plan.md](docs/project-plan.md#limits-and-open-questions) and [docs/open-problems.md](docs/open-problems.md).

## Team

| Member | Role |
|---|---|
| 1 | Agent code: extraction, verification, screening, grouping |
| 2 | Demo material and presentation |
| 3 | Cardano on-chain records, signing, passports |
| 4 | Sokosumi, Masumi, integration, live demo run |

---

# Setup

This project started from the [TUM hackathon quickstart](https://www.masumi.network/tum-hackathon). The agent (`npm start`) and the Sokosumi worker (`npm run worker`) run as **separate processes**. The Masumi agent API (`npm run api`) and the review screen (`npm run review`) are two more.

Private configuration lives in `.env` (copy [.env.example](.env.example)) and `.local/`. Both are ignored by git. Never commit keys or wallet secrets. The setting names are `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL`, `BLOCKFROST_API_KEY_PREPROD`, `COWORKER_ID`, `SOKOSUMI_ORGANIZATION_ID`, `SOKOSUMI_ORGANIZATION_SLUG`, `AGENT_AUTHOR`, `MPS_URL`, `AGENT_API_PORT`, `PAID_TASKS_ENABLED`, `CARDANO_WRITES_ENABLED`, and `PASSPORT_BASE_URL`.

Upload a batch and get its job input with `node upload.mjs [batchDir]` (default: the demo files in `battery/demo/`). Paid jobs take that job input and return the stage A draft. Unpaid Coworker tasks whose description is a job input also run stage A. Any other description goes straight to the model.
Adapt `agent/instructions.md` to change the agent's model behavior. Frontend work: see [docs/frontend.md](docs/frontend.md).

## Start the local agent

Use Node.js 24 or newer for the agent and CLI.

1. Clone this repository and enter its directory:

   ```sh
   git clone https://github.com/masumi-network/tum-hackathon-quickstart.git
   cd tum-hackathon-quickstart
   ```

2. Install the locked dependencies and prepare private configuration:

   ```sh
   npm ci
   cp .env.example .env
   chmod 600 .env
   ```

3. In `.env`, set `ZAI_API_KEY`, `ZAI_BASE_URL`, and `ZAI_MODEL` for your OpenAI-compatible model provider.
   For a custom model absent from AI Gateway's catalog, also set `ZAI_CONTEXT_WINDOW_TOKENS` to its documented context window.
   Use a positive whole number of tokens. Leave it blank to use Eve's catalog lookup.
4. Keep `EVE_PORT` and `EVE_URL` consistent. Start the agent:

   ```sh
   npm start
   ```

The agent listens on `127.0.0.1` and loads `.env` automatically.
Keep this terminal open while you use the worker.

For extra protection, consider [Socket Firewall](https://socket.dev/products/socket-firewall) for package installs.
If installed, prefix an install command with `sfw`, such as `sfw npm ci`.

## Connect your Sokosumi Coworker

Install Sokosumi CLI `1.0.4`. This starter uses its runtime adapter.
Check compatibility before changing that version.

```sh
npm install --global @masumi_network/sokosumi@1.0.4
sokosumi --version
sokosumi skills
```

1. Follow the [setup guide](https://www.masumi.network/tum-hackathon) to sign in with your own Preprod account.
   Create your own Vendor and a private Coworker with task access.
2. Connect the Coworker to your Personal Workspace for the first test.
   Import its runtime key through the CLI's supported credential interface. Keep the key in the CLI vault.
3. Set the returned `COWORKER_ID` in `.env`.
   Keep `PAID_TASKS_ENABLED=false` until you complete the payment setup below.
4. Start the worker in a second terminal:

   ```sh
   npm run worker
   ```

5. Create a task in your Personal Workspace. Replace `YOUR_COWORKER_ID` with your Coworker ID:

   ```sh
   sokosumi --preprod tasks create --personal --coworker-id YOUR_COWORKER_ID --description "Suggest names for our hackathon team." --status READY --json
   ```

Open the task in Sokosumi and check that it reaches `COMPLETED` with an answer.
Run only one worker for this project. Keep both local services running.

For CLI options, use `sokosumi --help` and its [official documentation](https://github.com/masumi-network/sokosumi/tree/main/apps/cli).

## Switch to the TUM Workspace

Keep both organization settings blank for your first Personal Workspace test.
Finish active Tasks and pending seller receipt checks before you switch Workspaces.

1. Join the [TUM Sokosumi Workspace](https://preprod.sokosumi.com/join/GTAHB3OQFWgg8rGetMfleiqgeL6_ltdW).
   Read its actual organization ID and slug:

   ```sh
   sokosumi --preprod workspaces list --json
   ```

2. Connect your existing Coworker to that Workspace. Replace each placeholder with your returned IDs:

   ```sh
   sokosumi --preprod coworkers connect YOUR_COWORKER_ID --vendor-id YOUR_VENDOR_ID --workspace-id YOUR_ORGANIZATION_ID --json
   sokosumi --preprod workspaces check YOUR_ORGANIZATION_ID --json
   ```

   If access is `PENDING`, ask a Workspace owner or admin to approve it, then run `connect` again.
   Continue only when access is `GRANTED` and your account is eligible to create tasks.
3. Stop the worker. In `.env`, set `SOKOSUMI_ORGANIZATION_ID` and `SOKOSUMI_ORGANIZATION_SLUG` to that Workspace's ID and slug.
   Set both together. The worker rejects incomplete settings and tasks from another Workspace.
4. Restart the worker:

   ```sh
   npm run worker
   ```

5. Create a task in the TUM Workspace:

   ```sh
   sokosumi --preprod tasks create --organization-slug YOUR_WORKSPACE_SLUG --coworker-id YOUR_COWORKER_ID --description "Suggest names for our hackathon team." --status READY --json
   ```

The worker uses the organization slug for task discovery and the organization ID for runtime execution.
Comments and paid tasks use the same Coworker and Workspace checks.
To return to Personal Workspace tasks, finish active work, clear both organization settings, and restart the worker.

## Optional Preprod payments

Prepare your own [Masumi Payment Service](https://github.com/masumi-network/masumi-payment-service) with its current setup instructions.
Use a dedicated database, encryption key, and selling wallet for this project.
Keep setup secrets, including that node's `ADMIN_KEY`, in `.local/mps.env` with permission `600`.
Fund your selling wallet with test ADA.

1. Create `docs/` and `.local/` if absent.
   Save your payment source's `sourceId`, selling wallet's `walletId`, and `sellerAddress` in `docs/payment-state.json`.
   Read these identifiers from your own MPS responses.
2. Set `MPS_URL`, `AGENT_API_PORT`, `AGENT_AUTHOR`, and `BLOCKFROST_API_KEY_PREPROD` in `.env`.
   Use your own name or team name for `AGENT_AUTHOR`.
3. Create the scoped runtime key, then register the agent:

   ```sh
   node --env-file=.env --env-file=.local/mps.env payment-registration.mjs key
   node --env-file=.env --env-file=.local/mps.env payment-registration.mjs register
   ```

4. Check registration until it confirms:

   ```sh
   node --env-file=.env --env-file=.local/mps.env payment-registration.mjs
   ```

5. Complete `docs/registration-state.json` with the confirmed `agentIdentifier`, actual `supportedPaymentSourceIndex`, and selling wallet's `sellerVkey`.
   Read these from your own confirmed registry and wallet responses.
   Start `npm run api`, set `PAID_TASKS_ENABLED=true`, and restart the worker.

Enable payments only after registration confirms and the scoped runtime key is saved in `.local/mps-runtime.env`.
Never copy another project's wallet, registration, or task IDs.
If a payment or registration write has an uncertain outcome, inspect its saved state before retrying.
Complete a paid task and check the seller's net receipt before you submit payment evidence.

## Check your changes

```sh
npm test
```

These tests check local logic. Test your own model connection, Coworker task, and seller receipt through the full setup flow.
The current `npm audit` reports three dependency findings: two high and one moderate, across `eve`, `undici`, and `zod`.
Review these before public deployment. Dependency versions stay pinned in `package-lock.json`.
Keep `.env`, `.local/`, wallet secrets, and generated resource state out of git.
