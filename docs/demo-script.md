# Demo script (draft)

A first version for Member 2 to edit. It follows the nine demo steps in [project-plan.md](project-plan.md#demo-scenario) and the pages of the review screen (`npm run review`, keys 1–5 switch pages). Timings assume a **5-minute** slot; adjust them once the presentation rules are known (open problem #10).

**Roles:** Presenter (Member 2) speaks. Operator (Member 4) drives the laptop.

## Before the presentation

| When | Who | What |
|---|---|---|
| Day before | Operator | Full rehearsal on the presentation laptop and network. Record the backup video of a full run. |
| T−60 min | Operator | Start everything in separate terminals: `powershell -ExecutionPolicy Bypass -File .local\start-mps.ps1`, `npm start`, `npm run worker`, `npm run review`. Open http://127.0.0.1:21952/status: every service must say *Running*, Sokosumi *GRANTED*. |
| T−45 min | Operator | Start the **paid run**: `node upload.mjs` and create the Sokosumi task with its job input. The payout unlocks about 36 minutes after the job starts, so the payout TxHash is ready by the time we present. |
| T−10 min | Operator | Check on /status that the task reached the result and payment stages. Open the review screen on the paid draft. Keep the backup video and the demo draft ready. |

**If the paid run is not ready:** present on the demo draft (it has the same packs, ESS units, warnings, and a real recorded AI explanation) and show the registration TxHash from /status. Say plainly which parts are recorded. Never show a TxHash that did not happen.

## On stage

| Time | Page (key) | Presenter says | Screen shows |
|---|---|---|---|
| 0:00–0:40 | Slides | From Feb 2027 every EV battery in the EU needs a digital passport. Batteries built before then have none, but their cells still have 5–10 years of life in home storage. To reuse them, someone has to prove where each cell came from. | Problem slide |
| 0:40–1:10 | Status page | A second-life company hired our agent on Sokosumi for three old packs. The fee is locked in escrow on Cardano. | /status: agent registered (link to its registration transaction), the task and its payment stage |
| 1:10–1:50 | Donor histories (2) | The agent read invoices, a German service report, an insurance record. Every line here is a quote with its page and line, checked by code, not by the AI. | Pack A timeline: "Modul 4 ersetzt", the 91% health report |
| 1:50–2:20 | Overview (1) | Code found a contradiction: 91% health 15 months after a module was replaced. That module is not taken apart. | Overview with the warning |
| 2:20–3:00 | Held back (4) | Modules with an accident or open warning are never opened. Single cells that don't match are held back with a reason. The grey boxes are the AI explaining the code's decision; it never makes the decision. | Held-back modules, cell groups, AI explanation boxes |
| 3:00–3:20 | Held back (4) | Bonus: someone claimed a fact that isn't in the invoice. The quote isn't in the document, so it is rejected. | Rejected claim A-x1 |
| 3:20–4:10 | ESS passports (3) → ESS-1 | Five new home batteries, 48 cells each. This one: 86.5% health, set by its weakest cell; made at our demo facility; and every cell traces back to its donor pack and source documents. | ESS-1 detail: health, facility, family tree, QR code |
| 4:10–4:40 | Sign (5) | The company signs. The donor histories and each ESS passport are written to Cardano, and the agent was paid when it delivered the draft. | Sign result: TxHashes; scan a QR code with a phone |
| 4:40–5:00 | Slides | Limits: we prove what a document says, not that it is true; legal acceptance of a reconstructed history is open. Next: cell-level data from real testers, Sokosumi file upload. | Limits / next steps slide |

## Rules

- Only show TxHashes, payments, and QR codes that really happened on Preprod. The status and review pages only show real ones; keep the slides the same.
- Say "test network (Preprod)" once, early.
- The AI explanation is labelled as AI on screen; say that code decided, the AI only explains.
- Check the Article 77 wording (open problem #12) before quoting it on a slide.
