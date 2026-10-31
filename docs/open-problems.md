# Open problems

What still blocks or weakens the demo, with an owner for each. Updated Oct 31, 09:20. Roles are in [team-plan.md](team-plan.md).

When you fix one, move it to **Solved** at the bottom with the commit hash, and push.

## Blocking the demo

| # | Problem | Why it matters | Owner | Next step |
|---|---|---|---|---|
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
- **Keys shared in chat** (Blockfrost, Gemini): replace them after the demo.
- **Vendor name:** buyers see the Coworker under the Vendor "Citation Escrow", reused from another project. Cosmetic.

## Solved

- #2: paid run through Sokosumi, end to end (Oct 31): task `01a190fe-859d-75e5-be4b-3ad10177652d` in the TUM Workspace, escrow lock [1767ef45…](https://preprod.cardanoscan.io/transaction/1767ef455ad0536a245a1f7dde2234596c1de1213ec5861a6eb3ffa98b465f46), result [e0d086e0…](https://preprod.cardanoscan.io/transaction/e0d086e0b928b7437cc9d5d274b8a33ef99c41fdf361ca55fcfd2a0612f2972f), payout [ff813786…](https://preprod.cardanoscan.io/transaction/ff813786651e7f0af39013d24c2d4c2707067a11582160de4fb247b627f8ef07); Sokosumi receipt `settled: true`, 1 test USDM net to the seller (checked on Blockfrost). This is the submission's payment evidence. Details: [paid-run-report.md](paid-run-report.md).
- #1: TUM Workspace access is `GRANTED`. Unpaid task `01a190f9-f34a-735b-a5ec-1dc8b7a5ede8` with the demo job input reached `COMPLETED` in 3 minutes (11 events, 2 warnings, 5 ESS, explanation). Follow-up comment "Why was module A-M4 not taken apart, and which quote decided it?" was answered from the draft, quoting A-e4 and A-e5.
- The worker could not run on Windows (`spawnSync sokosumi ENOENT`; `sokosumi skills path` ends in `skills`), and follow-ups on draft tasks were silently skipped (no chat session). Both fixed, with a regression test (`sokosumi-windows.test.mjs`).
- Code gaps closed (Oct 31): paid tasks only request payment for a valid job input; a failed draft attempt retries until the deadline (Sokosumi and direct Masumi paths); failed follow-up replies retry up to 3 times; a cleared module without a cell test batch is held back instead of lost; packs too large for one model call fail at once with the reason; uploads keep every version by hash; `/api/sign` accepts only same-machine JSON requests; Sign anchors missing file fingerprints first. The 3 Windows-only test failures were test assumptions and are fixed. 147/147 tests pass.
- QR codes open a readable passport page instead of Cardanoscan: `passport-site.mjs` builds one phone-friendly page per ESS passport (checked against the chain at build time) for GitHub Pages (`gh-pages` branch); `PASSPORT_BASE_URL` points the QR codes at it. Needs the repo public and Pages enabled on `gh-pages` (repo owner).
- First paid run through Masumi (Oct 31, Preprod, without Sokosumi): our buyer wallet hired our agent; escrow lock [caf71d8e…](https://preprod.cardanoscan.io/transaction/caf71d8e14c7416831d9438b1d762bd46baa44ed004756714292c132abb93033), result hash on-chain 9 minutes before the deadline [86da2e43…](https://preprod.cardanoscan.io/transaction/86da2e43730532f734c7581a5e2f5041afeda260c4528849934b19cf73dba3e7), payout [ba7dd0bb…](https://preprod.cardanoscan.io/transaction/ba7dd0bb7ec786b3ae30fe671aa472aaffa983c03b1671477767185ffedf695e) with 1 test USDM net to the seller. Details, costs, and what went wrong: [paid-run-report.md](paid-run-report.md). Repeat with `masumi-self-test.mjs`.
- End-to-end test of the local backend with the real model (Oct 31): `node --env-file=.env e2e.mjs` (needs `npm start`). Upload of the demo batch, stage A in 111 s under a 20-minute deadline, all 11 expected events verified, both warnings, the same 5 ESS units and held-back items as the reference, an AI explanation for every ESS and module, and stage B signs exactly the paid draft and refuses a changed one: 12/12 checks. The draft appears on the review screen as "Local end-to-end test".
- Member 4's machine has its own Cardano log wallet and company key (`npm run cardano -- brew`, private `.local/cardano.env`), funded with 105 tADA. A dry run of the demo draft builds all 14 transactions for 3.11 tADA. The review screen's Sign button can now write once `CARDANO_WRITES_ENABLED=true` is set for the demo.
- #5: label `1542` (after Regulation (EU) 2023/1542; `1984` is taken in CIP-10 by CIP-0171) and the first full test write on Preprod, Oct 31, marked `unpaid-test-run`: anchor [aeaa7cd7…d646](https://preprod.cardanoscan.io/transaction/aeaa7cd7c31f4641e524d2184af8f6521b9804f17a0eb1c05021189df981d646), 3 donor logs, 5 ESS logs, 5 passports, 14 transactions for a measured 3.081118 tADA (same as the dry run). ESS-1 passport [bb1c267b…f865](https://preprod.cardanoscan.io/transaction/bb1c267b3f9143091a3418a1be4d8928c139fc5a3d9fd854c2842d05cbe9f865) traces back to all 3 donors and the anchor, and `trace` reports the on-chain records match the draft and signed record. All TxHashes are in [member3-tasks.md](member3-tasks.md). Found during the run: Blockfrost can confirm a transaction while the wallet's UTxO view still lists the input it spent, so pack:C was first built on a spent input and refused; `waitConfirmed` now also waits until the wallet view holds the new change.
- #12: checked against the official text of Regulation (EU) 2023/1542. The linking rule is **Article 77(7)** (not 77(6), which is about access): "Such battery shall have a new battery passport linked to the battery passport or passports of the original battery or batteries." Responsibility moves to the operator placing the repurposed battery on the market. Article 77(1): passports from 18 February 2027 for EV batteries, LMT batteries, and industrial batteries over 2 kWh; recital 15 counts home storage as industrial, so each ESS needs one. Article 77(3) wants an ISO/IEC 15459 identifier behind the QR code (added to the limits in the project plan). Article 78(e) and (g): the passport must outlive its operator and its integrity must be ensured, which supports using Cardano. Plan and demo script updated.
- #8: the grouping explanation was tried with the real model (Gemini `gemini-3.5-flash`, Oct 31): 34 s, one note for each of the 5 ESS units, the 3 held-back modules, and 3 cell groups covering all 12 held-back cells. Every number, rule, event ID, and quote was checked against the draft by script; nothing invented and no regrouping suggested. The checked output is recorded in `examples/demo-explanation.json` and is now in the demo draft, so the review screen shows the AI explanation boxes. Re-record with `node --env-file=.env examples/demo-job.mjs --explain`. The A-M4 note quoted only the replacement (A-e4); the instructions now ask for a quote from each event a warning names, and the re-recorded note quotes both A-e4 and the 91% reading (A-e5). Checked by script again: every number, quote, event ID, and cell ID is in the draft.
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
