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

**Locally,** with the services running (see "Run it yourself" below), run `npm run review`:

- http://127.0.0.1:21952: the **review screen**, with the **New job** page (key `0`) for uploading a batch and copying the job input, plus timelines, warnings, ESS passport cards with QR codes, and **Sign and publish**
- http://127.0.0.1:21952/status: what is running, with Masumi registration, wallet balance, Sokosumi tasks, and links to escrow, result, and payout transactions

To hire the agent: on **New job**, use the demo batch and copy the job input. Then, in the TUM Sokosumi Workspace, create a task with the Coworker **EV Battery History Recovery**, paste the job input as the description, and pay.

**A company outside our machine** links its files instead of uploading them. Host each file at a public `https` address and list it with its SHA-256. A linked document also gives its pack, kind, and language:

```json
{"packs": ["A"],
 "documents": [{"doc_id": "packA-invoice-2021-de", "sha256": "<sha256 of the file>", "url": "https://example.com/invoice.txt",
                "pack_id": "A", "kind": "service_invoice", "language": "de"}],
 "module_tests": [{"module_id": "A-M2", "sha256": "<sha256>", "url": "https://example.com/A-M2-test.json"}],
 "cell_tests": [{"module_id": "A-M2", "sha256": "<sha256>", "url": "https://example.com/A-M2-cells.json"}]}
```

The agent downloads every linked file before it asks for payment and keeps a file only if its hash matches, so a changed or missing file stops the job before anyone pays. Only public https hosts are accepted (no redirects, at most 5 MB per file and 20 MB per job). See [remote-files.mjs](remote-files.mjs).

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
- **Documents are text files.** PDFs and photos need a reviewed text transcript first. Outside companies send files as public https links checked by hash; Sokosumi's own file attachments are not used yet.
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

# Run it yourself

Built on the [TUM hackathon quickstart](https://www.masumi.network/tum-hackathon). For account setup (Sokosumi Vendor and Coworker, Workspace access, Masumi Payment Service, agent registration), follow that guide with **your own** accounts and wallets. Never reuse our Coworker, wallet, or registration IDs.

**1. Install** (Node.js 24 or newer, Sokosumi CLI `1.0.4`):

```sh
git clone https://github.com/efeyoruk77/Afterlife.git
cd Afterlife
npm ci
cp .env.example .env && chmod 600 .env
npm install --global @masumi_network/sokosumi@1.0.4
```

**2. Configure `.env`.** Private settings live in `.env` and `.local/`, both ignored by git.

| Setting | What it is |
|---|---|
| `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL` | Any OpenAI-compatible model provider |
| `COWORKER_ID` | Your Coworker (its runtime key stays in the Sokosumi CLI vault) |
| `SOKOSUMI_ORGANIZATION_ID`, `SOKOSUMI_ORGANIZATION_SLUG` | The Workspace to serve. Several Workspaces: comma-separated, same order in both. Blank: Personal Workspace |
| `MPS_URL`, `AGENT_API_PORT`, `AGENT_AUTHOR`, `BLOCKFROST_API_KEY_PREPROD` | Masumi payments and Cardano reads |
| `PAID_TASKS_ENABLED` | `true` only after your agent's Masumi registration is confirmed; `false` runs tasks unpaid |
| `CARDANO_WRITES_ENABLED`, `PASSPORT_BASE_URL` | Stage B writes, and where passport QR codes point |

**3. Start the four services**, each in its own terminal. Run exactly one worker.

```sh
npm start         # the agent (model + extraction)
npm run worker    # picks up Sokosumi tasks
npm run api       # Masumi agent API, for paid jobs
npm run review    # review screen, New job page, /status, passports
```

**4. Run a job.** On http://127.0.0.1:21952, open **New job**, use the demo batch (or upload your own; `node upload.mjs [batchDir]` does the same from the terminal), and copy the job input. Create a Sokosumi task with your Coworker and paste the job input as the description. A description that is not a job input goes straight to the model, so follow-up questions work too.

**5. Check it:**

```sh
npm test                          # local logic, no network
node --env-file=.env e2e.mjs      # full stage A with the real model, compared with the reference draft
```

To change how the model extracts and explains, edit [agent/instructions.md](agent/instructions.md). Frontend notes: [docs/frontend.md](docs/frontend.md).
