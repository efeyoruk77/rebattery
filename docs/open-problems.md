# Open problems

What still blocks or weakens the demo, with an owner for each. Updated Oct 30, 22:10. Roles are in [team-plan.md](team-plan.md).

When you fix one, move it to **Solved** at the bottom with the commit hash, and push.

## Blocking the demo

| # | Problem | Why it matters | Owner | Next step |
|---|---|---|---|---|
| 1 | **Sokosumi access is `PENDING`** for Coworker "EV Battery History Recovery" in the TUM Workspace (access request `01a18e65-a2f3-776c-a880-da1e2e340986`). | No task can run in the TUM Workspace until it is `GRANTED`. | Member 4 / Sandro (Masumi) | Asked Sandro directly and booked a call. Re-check with `coworkers connect` (returns the same request, creates nothing). |
| 2 | **No paid run yet.** The payment service runs and the agent is registered (see Solved), but no paid task has gone through escrow. | The demo needs real TxHashes for escrow lock, result hash, and payout. | Member 4 | Run one paid task once Sokosumi access is granted (#1), then check the seller's net receipt. |
| 3 | **Buyers cannot upload files remotely yet.** For the demo this is solved: `node upload.mjs [batchDir]` stores a batch in `.local/uploads` and prints the job input, which goes into the Sokosumi task description. | A buyer outside our machine still has no upload path. | Member 4 | After the demo flow works: Sokosumi's task files API (`POST /v1/tasks/{id}/files`). |

## AI step (real model: Gemini `gemini-3.5-flash`)

First real run on the demo documents: 89 s for 3 packs, 11 events, 10 verified. After the date fix (#6): 11/11 verified in two runs, about 80 s. Run it with `node --env-file=.env battery/run-extract.mjs` while `npm start` is running.

| # | Problem | Owner | Next step |
|---|---|---|---|

## Demo and presentation

| # | Problem | Owner | Next step |
|---|---|---|---|
| 10 | **No demo script, slides, rehearsal, or backup video yet.** Presentation rules (duration, whether the demo is live) are unknown. | Member 2 | A first script is in [demo-script.md](demo-script.md) (timings for a 5-minute slot, who clicks what, the paid run starting ~45 min before, and the fallback if it is not ready). Still to do: check the presentation rules in the opening slides (`TBC26_Hackathon_Opening.pdf`, Telegram Announcements) and adjust the timings, then slides, rehearsal, backup video. |

## Smaller items

- **Member 3's log wallet is low:** 1.92 tADA left after the first run, less than one more full run (about 3.1 tADA). Top it up from the [Masumi dispenser](https://dispenser.masumi.network) before the demo.

- **Questions for Masumi:** how the result hash should link to several event logs in one job, and whether the price can differ from the fixed 1 test USDM.
- **Gemini free tier** returns 503 "high demand" errors at peak times (seen on newer models). Pick a backup model for demo day.
- **Review screen accepts requests from any page** (Member 4): `/api/sign` checks no `Host` or `Origin` and parses any body as JSON. Once `CARDANO_WRITES_ENABLED=true`, a page the company visits could trigger a real sign and Preprod write for a paid draft (DNS rebinding or a text/plain POST). Accept only `Host: 127.0.0.1:<port>` or `localhost:<port>` and `Content-Type: application/json` before enabling writes.
- **Keys shared in chat** (Blockfrost, Gemini): replace them after the demo.
- **Vendor name:** buyers see the Coworker under the Vendor "Citation Escrow", reused from another project. Cosmetic.
- **Three starter tests fail on Windows only** (Linux paths and file permissions). They test the starter's own code, not ours.

## Solved

- End-to-end test of the local backend with the real model (Oct 31): `node --env-file=.env e2e.mjs` (needs `npm start`). Upload of the demo batch, stage A in 111 s under a 20-minute deadline, all 11 expected events verified, both warnings, the same 5 ESS units and held-back items as the reference, an AI explanation for every ESS and module, and stage B signs exactly the paid draft and refuses a changed one: 12/12 checks. The draft appears on the review screen as "Local end-to-end test".
- Member 4's machine has its own Cardano log wallet and company key (`npm run cardano -- brew`, private `.local/cardano.env`), funded with 105 tADA. A dry run of the demo draft builds all 14 transactions for 3.11 tADA. The review screen's Sign button can now write once `CARDANO_WRITES_ENABLED=true` is set for the demo.
- #5: label `1542` (after Regulation (EU) 2023/1542; `1984` is taken in CIP-10 by CIP-0171) and the first full test write on Preprod, Oct 31, marked `unpaid-test-run`: anchor [aeaa7cd7…d646](https://preprod.cardanoscan.io/transaction/aeaa7cd7c31f4641e524d2184af8f6521b9804f17a0eb1c05021189df981d646), 3 donor logs, 5 ESS logs, 5 passports, 14 transactions for a measured 3.081118 tADA (same as the dry run). ESS-1 passport [bb1c267b…f865](https://preprod.cardanoscan.io/transaction/bb1c267b3f9143091a3418a1be4d8928c139fc5a3d9fd854c2842d05cbe9f865) traces back to all 3 donors and the anchor, and `trace` reports the on-chain records match the draft and signed record. All TxHashes are in [member3-tasks.md](member3-tasks.md). Found during the run: Blockfrost can confirm a transaction while the wallet's UTxO view still lists the input it spent, so pack:C was first built on a spent input and refused; `waitConfirmed` now also waits until the wallet view holds the new change.
- #12: checked against the official text of Regulation (EU) 2023/1542. The linking rule is **Article 77(7)** (not 77(6), which is about access): "Such battery shall have a new battery passport linked to the battery passport or passports of the original battery or batteries." Responsibility moves to the operator placing the repurposed battery on the market. Article 77(1): passports from 18 February 2027 for EV batteries, LMT batteries, and industrial batteries over 2 kWh; recital 15 counts home storage as industrial, so each ESS needs one. Article 77(3) wants an ISO/IEC 15459 identifier behind the QR code (added to the limits in the project plan). Article 78(e) and (g): the passport must outlive its operator and its integrity must be ensured, which supports using Cardano. Plan and demo script updated.
- #8: the grouping explanation was tried with the real model (Gemini `gemini-3.5-flash`, Oct 31): 34 s, one note for each of the 5 ESS units, the 3 held-back modules, and 3 cell groups covering all 12 held-back cells. Every number, rule, event ID, and quote was checked against the draft by script; nothing invented and no regrouping suggested. The checked output is recorded in `examples/demo-explanation.json` and is now in the demo draft, so the review screen shows the AI explanation boxes. Re-record with `node --env-file=.env examples/demo-job.mjs --explain`. Small wording idea: the A-M4 note quotes only the replacement (A-e4); quoting the 91% reading (A-e5) too would make the contradiction clearer.
- #11: each ESS card on the review screen shows a QR code for its passport transaction (`https://preprod.cardanoscan.io/transaction/<passport tx>`) once the draft is signed. Unsigned drafts show a placeholder, and only Preprod transaction links get a code. Uses `qrcode` 1.5.4, pinned.
- #4: Member 3's branch now uses the ESS format. It anchors every document and test file from `test_files`, writes one log and one passport per ESS with `health` and `second_life_facility`, and takes held-back modules and cells from the top-level `held_back` (`e1b63e9`, merged into main through PR #1). Nothing is on-chain until #5.
- Masumi Payment Service 0.29.0 runs with its own fresh PostgreSQL database and wallets on Member 4's machine (no Docker). Selling wallet funded from the dispenser. Agent "EV Battery History Recovery" registered on Preprod: [tx 04dd6863…c8f2](https://preprod.cardanoscan.io/transaction/04dd6863747ada3997441e5b1d7fae6c18bee51d9b6b88d6736d8dcbd8d3c8f2), confirmed in block 5354711.
- Tasks whose description is a job input now run stage A in the worker, even without payment, so the full flow can be tested in Sokosumi before payments are set up.

- Windows checkouts changed demo file line endings, so every document hash failed. Fixed with [.gitattributes](../.gitattributes) (`4c37990`).
- Two battery tests built Windows paths as `C:\C:\...`. Fixed with `fileURLToPath` (`c740f02`).
- Stage A was not connected to the battery code. All four steps are connected (`c740f02`).
- Extraction could run past the Masumi deadline. Model calls now stop at the deadline (`bc99b66`).
- #6: invoiced work and report measurements lost their dates (`date: null`), so verify() rejected them. The instructions now use the invoice or report date unless the document gives another. Gemini: 7/11 verified before, 11/11 in two runs after (`cc032ff`).
- #7: the sample events expected two accident events for B-M1 and B-M2. They now expect one event with both modules, as the model writes it; the demo draft is regenerated (11 events, 2 warnings, same ESS units and held-back items). Gemini on the demo documents: 11/11 expected events (`34c49d7`).
- #9: cell numbers were not padded in code, so a cell the model wrote as `C7` would not match its test result (`C07`) and would not be held back. `normalizeEvent` now writes module and cell IDs in the test-result form (`31fcd57`).
- One bad model reply could lose events in a paid run. Extraction now retries a pack when the verifier rejects events or the reply is empty, keeps the best reply, and uses it at the deadline. Live: Pack C's first Gemini call returned no answer, the retry was clean (`e403e8c`).
