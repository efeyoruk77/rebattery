# Frontend: start, run, and change it

Everything you need to work on the two web pages of the project. Roles and open problems are in [team-plan.md](team-plan.md) and [open-problems.md](open-problems.md).

## What the frontend is

One small local web server, [review.mjs](../review.mjs), serves two pages. There is no build step and no framework: each page is a single HTML file with inline CSS and JavaScript.

| Page | URL | File | What it shows |
|---|---|---|---|
| **Review screen** | http://127.0.0.1:21952 | [review.html](../review.html) | One draft: the donor packs' timelines, warnings, rejected claims, one passport card per ESS (health, facility, donors, family tree, QR code), held-back modules and cells, and the **Sign and publish** button. |
| **Status page** | http://127.0.0.1:21952/status | [status.html](../status.html) | What is running: local services, Masumi registration and wallet balance, Sokosumi access, tasks, Cardano write settings, open problems. Refreshes every 10 s. |

The server listens on `127.0.0.1` only, so the pages are reachable from your own computer, not from the network.

The review screen has its own pages, switched by the URL hash (keys 1–5 and `?` jump between them):

| Hash | Page |
|---|---|
| `#/overview` | Summary: packs in, ESS units out, warnings |
| `#/histories` | Donor pack timelines with quotes and sources |
| `#/ess` | Gallery of ESS passports |
| `#/ess/ESS-1` | One ESS: health, facility, family tree, QR code |
| `#/held` | Modules not taken apart, cells not used, rejected claims |
| `#/sign` | Sign and publish (paid drafts only) |
| `#/help` | How to read the screen |

## Start it on your machine

You need Node.js 24 and Git.

```sh
git pull
npm ci
npm run review
```

Then open http://127.0.0.1:21952. Stop it with Ctrl+C. Use another port with `REVIEW_PORT=21960 npm run review` (PowerShell: `$env:REVIEW_PORT=21960; npm run review`).

You need **no keys** for the review screen. The Draft menu (top right) has two demo drafts. The main one is [examples/demo-draft.json](../examples/demo-draft.json): 3 donor packs, 11 events, 2 warnings, 1 rejected claim, 5 ESS units of 48 cells, the held-back modules and cells, and a recorded AI explanation of the grouping (the grey "AI explanation" boxes on the ESS and Held back pages; the data is `draft.explanation`).

What differs between machines:

- **Status page:** it reads the machine it runs on. On your machine the services show *Stopped*, Masumi shows *not registered*, and Sokosumi shows *unknown*. That is expected. The real agent, payment service, and wallets run on Member 4's machine.
- **Wallet balance** on the status page needs `BLOCKFROST_API_KEY_PREPROD` in your own `.env` (free key from blockfrost.io, Preprod project). Without it the balance says *unknown*.
- **Second demo draft:** [examples/demo-mixed-draft.json](../examples/demo-mixed-draft.json) adds five packs to the three NMC packs: D (LFP), E (NMC, another cell model), F (NCA, cylindrical cells), G (LFP, another model than D) and H (the same AC-NMC-66P cells as A–C). It shows that cells are combined only within one cell family: 14 ESS units in 5 families, H's cells inside the A–C units, a compatibility matrix on the ESS passports page, and 36 NMC cells from pack E left over because they are not the AC-NMC-66P model. The rule is enforced in code: `assertOneFamily` in [battery/group.mjs](../battery/group.mjs) stops the draft if a unit would ever mix families, with tests in `battery/family.test.mjs`. Regenerate with `node battery/scripts/make-mixed-demo.mjs` (needs the demo tester key in `.local/`) and `node examples/demo-mixed-job.mjs`. It has no recorded AI explanation.
- **Paid drafts** appear in the draft picker only on the machine that ran the paid task (Member 4's). On other machines you only see the demo draft.
- **QR codes** appear only for a signed draft whose passports are on-chain. On the demo draft, each ESS card shows a placeholder box instead.

After changing an HTML file, reload the browser. After changing `review.mjs` or `status.mjs`, restart `npm run review`.

## Server routes

All JSON. Defined in [review.mjs](../review.mjs).

| Method and path | Returns |
|---|---|
| `GET /` | review.html |
| `GET /status` | status.html |
| `GET /api/drafts` | `[{ id, label, paid }]`: the demo draft (`id: "demo"`) plus every paid draft on this machine |
| `GET /api/draft?id=…` | `{ id, paid, draft, passports }`. `draft` is the Draft format below. `passports` is `{ "ESS-1": { txHash, url, svg } }` for a signed draft, `{}` otherwise; `svg` is the ready QR code. |
| `POST /api/sign` with `{ id, changes }` | Signs a **paid** draft and publishes it on Cardano (Member 3's code). Refuses the demo draft. Returns `{ signedRecord, donorTxs, newBatteryTxs, passports }`. |
| `GET /api/status` | The status page data, built by [status.mjs](../status.mjs): `services`, `masumi`, `sokosumi`, `tasks`, `cardano`, `team`. |

## Data the review screen renders

The Draft format is defined in [team-plan.md](team-plan.md#shared-data-formats). Top-level fields of a draft:

| Field | What it is |
|---|---|
| `packs` | Donor pack IDs, for example `["A", "B", "C"]` |
| `documents` | Source documents: `doc_id`, `pack_id`, `kind`, `sha256`, `anchor_tx` |
| `test_files` | Hashes of the module tests and cell test batches the job used |
| `events` | Verified events: `event_id`, `pack_id`, `module_ids`, `cell_ids`, `type`, `date`, `fields`, `confidence`, `source` (quote, document, page, line), `basis` |
| `rejected` | Claims the verifier rejected, with a reason (the demo has the tampered claim `A-x1`) |
| `warnings` | Rule-based warnings: `rule`, `events`, `message` |
| `rejected_tests` | Test files that failed their signature check |
| `new_batteries` | ESS units: `battery_id`, `cell_model`, `chemistry`, `rules`, `cells`, `donor_packs`, `health` (`soh_pct`, `usable_capacity_ah`, …), `second_life_facility` |
| `held_back` | Modules not taken apart and cells not used: `{ id, level: "module" or "cell", reason }` |
| `explanation` | The model's plain-language explanation of the grouping, or `null` (model failed, too close to the deadline, or the demo draft): `{ ess: { "ESS-1": text }, modules: { "B-M1": text }, cells: [{ cell_ids, text }] }`. Code keeps only IDs that are in the draft. Shown as grey "AI explanation" boxes on the ESS and Held back pages. |

To get a new demo draft after the battery code or demo files change: `node examples/demo-job.mjs`.

## Rules for frontend changes

- **Escape every value** you put into HTML with the page's `esc()` helper. Draft content comes from documents and is untrusted. The only raw HTML inserted is the QR `svg`, which the server generates itself.
- **No external scripts, fonts, or CDNs.** The demo must work offline and on a hackathon network.
- **Light and dark mode:** use the CSS variables in `:root` (`--bg`, `--panel`, `--ink`, `--muted`, `--line`, …) instead of fixed colors, and keep the `prefers-color-scheme: dark` block in sync.
- **Phone width:** layouts use `flex-wrap` and `auto-fit` grids; check the page in a narrow window.
- **Show only what is real.** Never display a made-up transaction, QR code, or payment as if it were on-chain. Placeholders must say what is missing.
- **Do not turn on Cardano writes** (`CARDANO_WRITES_ENABLED=true`) or sign anything on your machine. Real writes wait for the team decision in open problem #5.
- **Never put keys in pages or API responses.** `status.mjs` reads only public data; keep it that way.
- Run `npm test` before you push. Three starter tests fail on Windows only (Linux paths and permissions); every other test must pass.

## Ideas that would help the demo

- A printable or full-screen **QR passport view** per ESS, for the "scan the QR code" moment.
- A clearer **family tree** visual (ESS → modules → donor packs → documents).
- A **timeline view** across all three packs, with the 91% warning highlighted.
- Making the **bonus scene** (the rejected tampered claim) stand out.

## Running the full system (Member 4's machine)

The pages above are enough for frontend work. For reference, the full demo runs these, each in its own VS Code terminal:

1. `powershell -ExecutionPolicy Bypass -File .local\start-mps.ps1`: the project's PostgreSQL and the Masumi payment service (local setup under `.local/`, not in git).
2. `npm start`: the AI agent (needs a model key in `.env`).
3. `npm run review`: these pages.
4. `npm run worker`: picks up Sokosumi tasks (once TUM Workspace access is granted).
