# History Recovery Agent for EV Batteries

Oct 30, 2026 · @Arda

Old electric vehicle batteries are taken apart, their cells are tested, and cells with matching health are combined into new batteries for home or grid storage. An AI agent reconstructs each donor battery's history from scattered documents, down to the module or cell the documents name. Code groups matching cells into new batteries, and every step is recorded on Cardano with its source. The new battery gets a passport that links back to all of its donor batteries.

## The problem

From February 18, 2027, every electric vehicle battery placed on the EU market must have a digital passport. Batteries placed on the market before that date have no passport.

- **Cells inside one battery age differently.** A pack that had a module replaced, or a module damaged in an accident, contains cells with very different health. Even within one module, single cells drift apart. Second-life companies take packs apart and regroup cells with matching health into new batteries.
- **A regrouped battery needs a new passport.** A battery built from used cells counts as placed on the market again. The passport article of the regulation (Article 77) requires its passport to be linked to the passport of the original battery or batteries.
- **There are several originals, and none has a passport.** One new battery can contain cells from three or more donor packs. For pre-2027 donors, no passport was ever created, and the regulation does not address this case.
- **Information asymmetry.** At the end of a vehicle's life, batteries usually retain 70–80% of their capacity and can be used for another 5–10 years in stationary storage. But a buyer of a regrouped battery cannot see where each cell came from or what happened to it, which slows down the second-life market.
- **Existing solutions assume the data exists.** The Cardano Foundation's DPP standard and other efforts assume events are recorded as they happen. For old batteries, events were never recorded; the history exists only in invoices, service records, and reports.

## Why cells

Grouping whole modules wastes good cells: one weak cell drags down a whole module, and a module replacement leaves new and old cells in one pack. Grouping single cells gives the best match and uses the most of each donor pack.

The history has three levels: pack, module, and cell. Documents usually name a pack or a module ("module 4 replaced"), and sometimes a single cell ("lowest cell voltage: module 2, cell 3"). Each event is tied to the most specific level its document names. Testing and grouping happen per cell, and an event on a module applies to every cell in it.

Cell-level disassembly costs more than module-level, especially where cells are welded or glued. That cost is the company's decision; the data model works the same either way.

## Who uses it

| User | What they need | What they get from the agent |
|---|---|---|
| Second-life company (regroups cells into home or grid storage) | Pack-, module-, and cell-level history for every donor, and a passport for the new battery that links to all donors | A sourced history per donor, a checked grouping, and a family tree ready to sign |
| Buyer of a second-life battery | Where each cell came from and what happened to it | A battery history report with the evidence shown, cell by cell |
| Recycling facility | Chemistry and damage history, for safe handling | A sourced record of chemistry and accident events per module and cell |

## How it works

The work is split into two stages. The agent is paid for a draft in stage A. The company signs and publishes in stage B, at its own pace.

**Stage A: paid draft (Masumi job)**

1. **Documents:** The company uploads all documents for each donor pack and vehicle, plus the signed cell test results (one export file per pack from the cell tester). The hash of each document is anchored on-chain.
2. **Hiring:** The company hires the "History Recovery" agent on Sokosumi for the batch, through Masumi. The job input lists the uploaded documents by ID and SHA-256 hash, so the job's input hash fixes exactly which documents were submitted. The fee is locked in escrow.
3. **AI extracts events:** The agent reads the documents and turns them into chronologically ordered events. Each event is linked to its location in the document (page, line) and, where the document says so, to a specific module or cell (for example "module 4 replaced").
4. **Code verifies:** Deterministic code verifies that every quote actually exists in the document. Information not found in the document is rejected.
5. **Inconsistencies are flagged:** The agent finds contradictions between events, for example a high health value after a module replacement.
6. **Code groups cells:** Using the signed cell test results (capacity, internal resistance, self-discharge), deterministic code proposes how to group cells into new batteries. A group must share the same cell model and chemistry and stay within set limits for capacity, internal resistance, and self-discharge. Cells from a module with an accident or open warning are held back. The agent explains each grouping decision; it does not make it.
7. **Draft delivered and paid:** The agent delivers the draft (donor histories, rejected items, warnings, proposed grouping). Its hash is submitted to Masumi on-chain, and after the dispute window the escrow is paid to the agent. Masumi requires the result within 20 minutes of the funds being locked, which is why no human step sits inside stage A.

**Stage B: sign and publish (company, after payment)**

8. **A human signs:** The company reviews the draft, can reject the proposed grouping, signs it with its own key, and takes responsibility. The signed record includes the Masumi result hash, so it points back to the exact draft the agent was paid for.
9. **On-chain record:** Each donor's event log gets a "disassembled, cell X moved to new battery Y" event, and the new battery gets an "assembled from" event listing every cell and donor.
10. **New passport:** The new battery's passport links to the event logs of all its donor batteries.

## EV documents: what is extracted from which document

Information about an EV's battery sits in scattered documents held by the vehicle owner and service shops. The agent turns them into a single history per donor pack, with events tied to a module or cell where the document names one.

| Document | Extracted event or information | Level | Typical confidence level |
|---|---|---|---|
| Battery label photo | Manufacturer, model, chemistry, nominal capacity, production date | Pack | Documented (estimated, depending on legibility) |
| Vehicle registration | VIN, first registration date | Pack | Documented |
| Authorized service invoices | Module or cell replacement, software update, fault | Often names the module | Documented |
| Dealer battery health report | Measured state of health and its date, sometimes the weakest module or cell | Pack, sometimes module or cell | Documented (signed, if the service signed it) |
| Accident and insurance records | Accident date, location and severity of damage | Sometimes names the damaged area | Documented |
| Charging history (app export) | Fast-charging ratio, deep-discharge events | Pack | Documented |
| Warranty claims | Battery complaints and the manufacturer's response | Sometimes | Documented |
| Second-life cell test results | Capacity, internal resistance, self-discharge, cell model per cell | Cell | Signed (by the second-life company) |
| Comparing multiple documents | Estimated remaining capacity, inconsistency warnings | Either | Estimated |

## Grouping rules

Equal health percentage alone is not enough. Two cells can both show 85% and still not work well together. Grouping code uses these rules:

- **Same cell model and chemistry.** Never mixed.
- **Capacity within a set band** (for example ±3% of the group average).
- **Internal resistance within a set band.** Mismatched resistance causes imbalance and uneven aging.
- **Self-discharge below a limit** (for example 2 mV per day). High self-discharge points to an internal fault.
- **Clean history.** A cell whose module has an accident event, an open inconsistency warning, or no traceable donor is held back for manual review.
- **Measured values only.** Grouping uses signed test results, never estimated fields.

Every group records which rule values it was built with, so a buyer can check the decision later.

## Grounding principle: the AI is a clerk, not a witness

The AI never says "this is true"; it only says "this document says this." So it does not weaken the record's grounding; it strengthens it.

- **Source documents are anchored on-chain:** The hash of each document is on Cardano, so anyone can go back to the source.
- **Every piece of information is linked to its location in the document:** Code, not AI, verifies that the quote exists in the document.
- **Confidence levels are separate:** Signed (the source itself signed it), documented (from a document whose hash is on-chain), estimated (a conclusion reached by the AI). Estimated fields cannot serve as the basis for legally significant decisions, including grouping.
- **Code decides the grouping:** The AI explains it; deterministic rules make it.
- **Responsibility lies with a human:** The second-life company signs the histories and the grouping with its own key.
- **It gets stronger over time:** As signed real measurements come in from the battery, estimated fields are updated with them; the history is never deleted.

## Cardano integration

The on-chain side is built with ready-made patterns, so the effort goes into the AI part.

- **Cardano Foundation DPP standard, Event Log pattern:** An append-only history to which multiple companies add events throughout the product's life cycle. About 0.25 ADA per batch record. The events the agent extracts are written in this pattern's format, using its example code.
- **Lineage between batteries:** Each donor's event log ends with a "disassembled" event saying which cell went to which new battery. The new battery's event log starts with an "assembled from" event listing each cell and the donor log it came from. Anyone can follow a cell in either direction.
- **Masumi and Sokosumi:** The agent is registered in Masumi's on-chain registry with its own selling wallet, so buyers can find it on Sokosumi. When hired, the fee is held in escrow. The agent starts work only after the funds are confirmed locked, submits the hash of its draft on-chain, and is paid out after the dispute window. The fingerprint of the draft lands on-chain with the payment; the company's signed record later points to that same hash.
- **Document hashes:** The hash of each source document is written on-chain; the document itself is stored off-chain.
- **Signature:** The second-life company's signature permanently records on-chain who took responsibility.

**Why Cardano:** The regulation requires passports to travel across the product's lifetime and across multiple companies. Once cells from several packs are mixed, no single company holds the whole history. It needs a shared record that no single company can change on its own. Cardano's low and predictable fees also keep costs reasonable for millions of cells.

## Demo scenario

Three 2020-model EV packs of the same model will be taken apart and their good cells regrouped into one home storage battery. For the demo each pack has 8 modules of 4 cells; real packs have hundreds of cells. None of the packs has a passport.

1. Documents and signed cell test files are uploaded per pack, then the second-life company hires the agent on Sokosumi for the three packs; the fee is locked in escrow on Preprod.
2. The uploaded documents:
   - **Pack A:** label photo, registration, a German service invoice for a 2021 module 4 replacement, a 2022 dealer health report.
   - **Pack B:** label photo, registration, an insurance record for a 2023 accident with damage near modules 1–2.
   - **Pack C:** label photo, registration, an English service invoice for a software update.
3. The agent shows a timeline per pack, with each event tied to a module or cell where the document names one. Each event shows its source and confidence level.
4. The agent raises a warning: Pack A's 2022 report states 91% health, but this is inconsistent with the 2021 module replacement.
5. The grouping code proposes one new battery from 81 matching cells. It holds back all cells of Pack B's modules 1–2 (accident), all cells of Pack A's replaced module 4 (open warning), and three single cells that fail a test limit.
6. The family tree appears: new battery → cells → modules → donor packs → source documents.
7. Bonus scene: someone tries to add a piece of information that is not in an invoice as supposedly "documented". The code cannot find the quote in the document and rejects it.
8. The agent submits the draft's hash to Masumi and the escrow is paid.
9. The company signs, and the donor and new-battery events are written on-chain. Real TxHashes are shown for the escrow payment, the result hash, and the event logs.

## Limits and open questions

- **The document itself could be fake.** The system proves what a document says, not that the document is true. Documents digitally signed by a service shop or the manufacturer reduce this risk.
- **Module and cell identity.** Old documents rarely use the same numbering as the physical pack. The demo assumes the manufacturer's numbering; real use needs a mapping step when the pack is opened, and each removed cell needs a label.
- **Legal acceptance is unclear.** The regulation does not settle whether a reconstructed history would be accepted in place of an "original passport." The project is a proposed solution to this gap, not an official approval. Check the exact Article 77 wording on linking to several original batteries before the pitch.
- **Grouping limits are examples.** The capacity and resistance bands in the demo are placeholders. Real limits depend on the cell model and the new battery's design.
- **Personal data.** Registration and insurance documents contain personal data. Documents are kept off-chain; only hashes are on-chain. Personal information must be stripped from the events.
- **Passport access rules are not finalized yet.** Implementing decisions that will determine who can access which fields are still pending.
- **Payment happens before signing.** The agent is paid for a draft, even if the company later rejects parts of it. A company that disagrees with the draft can use Masumi's dispute window. The demo payout timing (about 36 minutes before unlock, 52 before the dispute deadline) comes from the starter code.
- **To confirm with Masumi:** How the result hash should be linked to the event logs, now that one job covers several donors and one new battery, and whether a larger or dynamic price is possible instead of the fixed 1 test USDM; to be discussed with the team at their booth.

## Sources

- Digital Product Passport on Cardano (Cardano Foundation, cardano-dpp-standards)
- EU Digital Product Passport on Cardano: Batteries (Lambda Sistemi)
- Do Recycled Batteries Need a Battery Passport? (Arianee)
- The EU Battery Passport: What Regulation 2023/1542 Requires (BD Emerson)
- The EU Battery Passport Explained (Automotive IQ)
- Masumi: Refunds & Disputes
