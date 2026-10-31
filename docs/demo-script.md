# Demo script (draft)

A first version for Member 2 to edit. It follows the nine demo steps in [project-plan.md](project-plan.md#demo-scenario) and the pages of the review screen (`npm run review`, keys 1–5 switch pages). Timings assume a **5-minute** slot; adjust them once the presentation rules are known (open problem #10).

**Roles:** Presenter (Member 2) speaks. Operator (Member 4) drives the laptop.

## Before the presentation

| When | Who | What |
|---|---|---|
| Day before | Operator | Full rehearsal on the presentation laptop and network. Record the backup video of a full run. |
| T−60 min | Operator | Start everything in separate terminals: `powershell -ExecutionPolicy Bypass -File .local\start-mps.ps1`, `npm start`, `npm run worker`, `npm run review`. Open http://127.0.0.1:21952/status: every service must say *Running*, Sokosumi *GRANTED*. |
| T−45 min | Operator | Start the **paid run**: on the review screen's **New job** page (key 0), upload the batch, copy the job input, and create the Sokosumi task with it. The payout unlocks about 36 minutes after the job starts, so the payout TxHash is ready by the time we present. |
| T−10 min | Operator | Check on /status that the task reached the result and payment stages. Open the review screen on the paid draft. Keep the backup video and the demo draft ready. |

**If the paid run is not ready:** present on the demo draft (it has the same packs, ESS units, warnings, and a real recorded AI explanation) and show the registration TxHash from /status. Say plainly which parts are recorded. Never show a TxHash that did not happen.

## On stage

| Time | Page (key) | Presenter says | Screen shows |
|---|---|---|---|
| 0:00–0:40 | Slides | From 18 February 2027, EV batteries and industrial batteries over 2 kWh, which includes home storage, need a digital passport (Article 77(1)). Batteries built before then have none, but their cells still have 5–10 years of life in home storage. To reuse them, someone has to prove where each cell came from. | Problem slide |
| 0:40–1:10 | Status page | A second-life company hired our agent on Sokosumi for three old packs. The fee is locked in escrow on Cardano. | /status: agent registered (link to its registration transaction), the task and its payment stage |
| 1:10–1:50 | Donor histories (2) | The agent read invoices, a German service report, an insurance record. Every line here is a quote with its page and line, checked by code, not by the AI. | Pack A timeline: "Modul 4 ersetzt", the 91% health report |
| 1:50–2:20 | Overview (1) | Code found a contradiction: 91% health 15 months after a module was replaced. That module is not taken apart. | Overview with the warning |
| 2:20–3:00 | Held back (4) | Modules with an accident or open warning are never opened. Single cells that don't match are held back with a reason. The grey boxes are the AI explaining the code's decision; it never makes the decision. | Held-back modules, cell groups, AI explanation boxes |
| 3:00–3:20 | Held back (4) | Bonus: someone claimed a fact that isn't in the invoice. The quote isn't in the document, so it is rejected. | Rejected claim A-x1 |
| 3:20–4:10 | ESS passports (3) → ESS-1 | Five repurposed home batteries, 48 cells each. The law says each one needs a new passport linked to the passports of its original batteries (Article 77(7)); ours have none, so we rebuild the history. This one: 86.5% health, set by its weakest cell; made at our demo facility; and every cell traces back to its donor pack and source documents. | ESS-1 detail: health, facility, family tree, QR code |
| 4:10–4:40 | Sign (5) | The company signs. The donor histories and each ESS passport are written to Cardano, and the agent was paid when it delivered the draft. | Sign result: TxHashes; scan a QR code with a phone |
| 4:40–5:00 | Slides | Limits: we prove what a document says, not that it is true; legal acceptance of a reconstructed history is open; real use needs an ISO/IEC 15459 identifier behind the QR code (Article 77(3)). Next: cell-level data from real testers, Sokosumi file upload. | Limits / next steps slide |

## Rules

- Only show TxHashes, payments, and QR codes that really happened on Preprod. The status and review pages only show real ones; keep the slides the same.
- Say "test network (Preprod)" once, early.
- The AI explanation is labelled as AI on screen; say that code decided, the AI only explains.
- Quote the law exactly. Article 77(7): "Such battery shall have a new battery passport linked to the battery passport or passports of the original battery or batteries."
- Say "repurposed", not "remanufactured": our ESS units are at 86.5–89.4 % health, below the 90 % that recital 17 uses for remanufacturing.

## Demo video (2:30)

One real paid run, recorded end to end in the browser, with the waits cut out. Recorded on **Member 4's machine**, because the payment service, worker, and Cardano wallet run there. Budget about **75 minutes** for one take: the payout unlocks about 36 minutes after the job starts.

### Shot list

| Time | Scene | Screen | Narration |
|---|---|---|---|
| 0:00–0:15 | Problem | Title slide | "From 2027, EV batteries need a digital passport. Older ones have none, so their cells can't be reused with a traceable history." |
| 0:15–0:35 | Hire on Sokosumi | Review screen **New job** → *Use the demo batch* → *Copy job input* → Sokosumi: new task with the coworker, paste, pay | "A second-life company hires our agent on Sokosumi for three old car batteries. The fee is locked in escrow on Cardano." Flash the **Escrow locked ↗** link from /status. |
| 0:35–0:50 | Agent works | /status: the task's payment stage moving (sped up), caption *about 2 min* | "The agent reads invoices, service reports and an insurance record." |
| 0:50–1:20 | What it found | **Donor histories** (2) → Overview warning (1) → **Held back** (4) | "Every fact is a quote with page and line, checked by code. Code finds a contradiction and keeps that module out. The AI only explains." |
| 1:20–1:40 | New batteries | **ESS passports** (3) → ESS-1 | "240 matching cells become five home batteries. Each traces back to its donor packs." |
| 1:40–2:00 | Sign | **Sign** (5) → *Sign and publish* → transaction IDs | "The company signs. The histories and passports are written to Cardano." |
| 2:00–2:15 | Scan | Phone films the QR code on ESS-1; the passport page opens | "Anyone can scan the unit and see where its cells came from." |
| 2:15–2:30 | Paid | Caption *about 40 min later* → /status: **Payout ↗** and *1 USDM received* | "The agent was paid automatically once the escrow unlocked." |

### One-time setup (day before)

1. `git pull` on Member 4's machine, then `npm ci` if `package-lock.json` changed.
2. In `.env`:
   - A working model key. Gemini's free tier runs out after a few runs a day: keep a second key ready. **After any change to `.env`, restart `npm start`**; it reads `.env` only when it starts.
   - `PAID_TASKS_ENABLED=true` (payment setup is already done on this machine).
   - `CARDANO_WRITES_ENABLED=true` for the Sign step. This is a real write on Preprod: **team decision first**. Check the log wallet balance on /status (a full Sign costs about 3.1 tADA).
   - `PASSPORT_BASE_URL` set to the public passport site, if it is live (it needs the repo public and GitHub Pages on the `gh-pages` branch). If not, the QR codes open the passport on Cardanoscan, which is also fine on camera.
3. Recording tools: OBS (or Windows Game Bar, Win+G) at 1920×1080 for the screen, and a second phone to film the QR scan. Browser zoom 125% so text is readable in the video. Close other tabs and notifications.
4. Rehearse once without recording. Without the team's go-ahead for writes, stop before pressing *Sign and publish*.

### Recording day

1. **Start the services**, each in its own VS Code terminal (not from a Claude Code session, which stops them when paused):
   1. `powershell -ExecutionPolicy Bypass -File .local\start-mps.ps1` (database and payment service)
   2. `npm start` (AI agent)
   3. `npm run worker` (picks up Sokosumi tasks)
   4. `npm run review` (review screen and status page)
2. **Keep the laptop plugged in, open, and awake** for the whole take (power settings: never sleep). The first paid run's payout stalled for 86 minutes when the lid closed.
3. Open http://127.0.0.1:21952/status: every service *Running*, Sokosumi *GRANTED*. Open http://127.0.0.1:21952/#/new in a second tab, and Sokosumi (TUM Workspace) in a third.
4. **Start recording**, then run the steps in order. Record each scene as its own clip; let the recorder run through the waits, and cut later:
   1. **New job** → *Use the demo batch* → *Copy job input*.
   2. Sokosumi → new task with the coworker **EV Battery History Recovery** → paste the job input as the description → pay when asked (1 test USDM).
   3. /status (refreshes every 10 s): wait for *Escrow locked ↗* and *Result hash ↗*. Open each link once so the Cardanoscan page is on camera.
   4. When the draft is delivered, pick the paid task in the review screen's **Draft** menu (top right) and record the pages of scenes 0:50–1:40.
   5. **Sign** → *Sign and publish*. Wait for the transaction IDs (a few minutes). If the passport site is used, rebuild and publish it now (`node --env-file-if-exists=.env passport-site.mjs`, then push `site/` to `gh-pages`; set `PUBLISH_PAID_HISTORIES=true` only because the demo data is invented).
   6. ESS-1: film the QR scan with the second phone.
   7. Leave everything running. After the unlock time (about 36 minutes after the job started), /status shows *Payout ↗* and *1 USDM received*. Record that.
5. Note the Sokosumi task ID and the three transaction IDs from /status: the submission needs them.

### Editing

- Cut every wait and put a small caption on each jump (*about 2 min later*, *about 40 min later*), so nobody thinks the run was faked.
- Hold each transaction link about one second; viewers can pause on it.
- Record the narration separately and lay it over the clips. That makes 2:30 easy to hit.
- Zoom in on small text in the editor rather than recording at a large zoom.
- Same rules as on stage: say "test network (Preprod)" once, show only transactions that really happened, and label the AI explanation as AI.

**If the new run fails:** use the first paid Sokosumi task (`01a190fe…`, see open problem #2), whose transactions are real, and the demo draft with its recorded test-run passports. Say which parts are from that earlier run.
