# Open problems

What still blocks or weakens the demo, with an owner for each. Updated Oct 30, 22:10. Roles are in [team-plan.md](team-plan.md).

When you fix one, move it to **Solved** at the bottom with the commit hash, and push.

## Blocking the demo

| # | Problem | Why it matters | Owner | Next step |
|---|---|---|---|---|
| 1 | **Sokosumi access is `PENDING`** for Coworker "EV Battery History Recovery" in the TUM Workspace (access request `01a18e65-a2f3-776c-a880-da1e2e340986`). | No task can run in the TUM Workspace until it is `GRANTED`. | Member 4 / Sandro (Masumi) | Asked Sandro directly and booked a call. Re-check with `coworkers connect` (returns the same request, creates nothing). |
| 2 | **Masumi Payment Service not set up.** | Escrow, agent registration, payout, and the payment TxHashes for the demo all depend on it. Largest remaining piece. | Member 4 | In progress. A project-only setup (payment service 0.29.0 + its own PostgreSQL, ports on 127.0.0.1 only, fresh database and wallets) is ready on Member 4's machine; Docker Desktop's WSL integration currently fails to start. Next: start it, read the payment source and selling wallet, fund the wallet from the [Masumi dispenser](https://dispenser.masumi.network), then register the agent with team approval. |
| 3 | **Buyers cannot upload files remotely yet.** For the demo this is solved: `node upload.mjs [batchDir]` stores a batch in `.local/uploads` and prints the job input, which goes into the Sokosumi task description. | A buyer outside our machine still has no upload path. | Member 4 | After the demo flow works: Sokosumi's task files API (`POST /v1/tasks/{id}/files`). |
| 4 | **Member 3's branch uses the earlier format** (one new battery, per-pack cell test files). Main now has 5 ESS units and per-module test files. | It cannot be merged, so nothing can be written on-chain yet. | Member 3 | Read `test_files` from the draft, write one log and passport per ESS with `health` and `second_life_facility`, take held-back items from the top-level `held_back`. Details under Member 3 in [team-plan.md](team-plan.md). |
| 5 | **First real on-chain write needs team approval**, and the metadata label is still a placeholder (`1984`). | Member 3 is waiting on both. | Whole team | Agree on the label, then approve one test write on Preprod. |

## AI step (real model: Gemini `gemini-3.5-flash`)

First real run on the demo documents: 89 s for 3 packs, 11 events, 10 verified. After the date fix (#6): 11/11 verified in two runs, about 80 s. Run it with `node --env-file=.env battery/run-extract.mjs` while `npm start` is running.

| # | Problem | Owner | Next step |
|---|---|---|---|
| 7 | **`sample-events.json` still expects two accident events** for B-M1 and B-M2. The model correctly writes one event with `module_ids: ["B-M1", "B-M2"]`, so `run-extract` reports it as missing. The demo draft is also built from the old sample. | Member 1 + Member 2 | Merge the two events into one, then regenerate the demo draft with `node examples/demo-job.mjs`. |
| 8 | **The grouping explanation still reads `modules`.** It should read the draft's `new_batteries` (ESS units) and `held_back` (with `level`). | Member 1 | Update the GROUPING EXPLANATION section of [agent/instructions.md](../agent/instructions.md). |
| 9 | **Cell numbers are not padded in code.** The instructions now ask for `A-M3-C07`, but if the model still writes `C7`, `normalizeEvent` does not fix it, and that cell would not be held back. | Member 1 | Pad cell numbers to two digits in `normalizeEvent`. |

## Demo and presentation

| # | Problem | Owner | Next step |
|---|---|---|---|
| 10 | **No demo script, slides, rehearsal, or backup video yet.** Presentation rules (duration, whether the demo is live) are unknown. | Member 2 | Check the opening slides (`TBC26_Hackathon_Opening.pdf` in the Telegram Announcements topic) for the rules, then write the script. |
| 11 | **No QR code image per ESS.** The review screen shows each ESS's passport card, but there is no QR code yet. | Member 4 + Member 3 | Member 3 provides the passport URL or identifier; Member 4 adds the QR code to the review screen. |
| 12 | **Article 77 wording** on linking to several original batteries is not checked. | Member 2 | Check the exact text before putting it on a slide. |

## Smaller items

- **Questions for Masumi:** how the result hash should link to several event logs in one job, and whether the price can differ from the fixed 1 test USDM.
- **Gemini free tier** returns 503 "high demand" errors at peak times (seen on newer models). Pick a backup model for demo day.
- **Keys shared in chat** (Blockfrost, Gemini): replace them after the demo.
- **Vendor name:** buyers see the Coworker under the Vendor "Citation Escrow", reused from another project. Cosmetic.
- **Three starter tests fail on Windows only** (Linux paths and file permissions). They test the starter's own code, not ours.

## Solved

- Tasks whose description is a job input now run stage A in the worker, even without payment, so the full flow can be tested in Sokosumi before payments are set up.

- Windows checkouts changed demo file line endings, so every document hash failed. Fixed with [.gitattributes](../.gitattributes) (`4c37990`).
- Two battery tests built Windows paths as `C:\C:\...`. Fixed with `fileURLToPath` (`c740f02`).
- Stage A was not connected to the battery code. All four steps are connected (`c740f02`).
- Extraction could run past the Masumi deadline. Model calls now stop at the deadline (`bc99b66`).
- #6: invoiced work and report measurements lost their dates (`date: null`), so verify() rejected them. The instructions now use the invoice or report date unless the document gives another. Gemini: 7/11 verified before, 11/11 in two runs after (`cc032ff`).
