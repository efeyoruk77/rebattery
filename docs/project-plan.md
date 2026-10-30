# History Recovery Agent for EV Batteries

Oct 30, 2026 · @Arda

An AI agent reconstructs the history of old electric vehicle batteries that have no passport from scattered documents, and records each event on Cardano together with its source. This way, the battery can start its second life with a legally accepted passport.

## The problem

From February 18, 2027, every electric vehicle battery placed on the EU market must have a digital passport. Batteries placed on the market before that date have no passport.

- **A second life requires a new passport.** If a battery removed from a vehicle is converted into, for example, a home storage system, it counts as being placed on the market again. The passport article of the regulation (Article 77) requires a new passport linked to the original passport in this case.
- **There is no original to link to.** For a pre-2027 battery, an original passport was never created, and the regulation does not address this case.
- **Information asymmetry.** At the end of a vehicle's life, batteries usually retain 70–80% of their capacity and can be used for another 5–10 years in stationary storage. But a buyer cannot verify the real condition of a used battery, which slows down the second-life market.
- **Existing solutions assume the data exists.** The Cardano Foundation's DPP standard and other efforts assume events are recorded as they happen. For old batteries, events were never recorded; the history exists only in invoices, service records, and reports.

## Who uses it

| User | What they need | What they get from the agent |
|---|---|---|
| Second-life company (converts EV batteries into home or grid storage) | A linkable history for the new passport | A sourced, ready-to-sign event history |
| Used EV buyer or dealer | The battery's real condition: accidents, module replacements, health | A battery history report with the evidence shown |
| Recycling facility | Chemistry and damage history, for safe handling | A sourced record of chemistry and accident events |

## How it works

1. **Hiring:** A second-life company hires the "History Recovery" agent on Sokosumi for one battery, through Masumi. The fee is locked in escrow.
2. **Documents:** The company uploads all documents for the battery and the vehicle. The hash of each document is anchored on-chain.
3. **AI extracts events:** The agent reads the documents and turns them into chronologically ordered events. Each event is linked to its location in the document (page, line).
4. **Code verifies:** Deterministic code verifies that every quote actually exists in the document. Information not found in the document is rejected.
5. **Inconsistencies are flagged:** The agent finds contradictions between events, for example a high health value after a module replacement.
6. **A human signs:** The company reviews the history, signs it with its own key, and takes responsibility.
7. **On-chain record and payment:** The events are written to Cardano, the hash of the result is delivered to Masumi, and the escrow is paid to the agent.
8. **New passport:** The second-life passport is linked to this history.

## EV documents: what is extracted from which document

Information about an EV's battery sits in scattered documents held by the vehicle owner and service shops. The agent turns them into a single history.

| Document | Extracted event or information | Typical confidence level |
|---|---|---|
| Battery label photo | Manufacturer, model, chemistry, nominal capacity, production date | Documented (estimated, depending on legibility) |
| Vehicle registration | VIN, first registration date | Documented |
| Authorized service invoices | Module or cell replacement, software update, fault | Documented |
| Dealer battery health report | Measured state of health and its date | Documented (signed, if the service signed it) |
| Accident and insurance records | Accident date, location and severity of damage | Documented |
| Charging history (app export) | Fast-charging ratio, deep-discharge events | Documented |
| Warranty claims | Battery complaints and the manufacturer's response | Documented |
| Comparing multiple documents | Estimated remaining capacity, inconsistency warnings | Estimated |

## Grounding principle: the AI is a clerk, not a witness

The AI never says "this is true"; it only says "this document says this." So it does not weaken the record's grounding; it strengthens it.

- **Source documents are anchored on-chain:** The hash of each document is on Cardano, so anyone can go back to the source.
- **Every piece of information is linked to its location in the document:** Code, not AI, verifies that the quote exists in the document.
- **Confidence levels are separate:** Signed (the source itself signed it), documented (from a document whose hash is on-chain), estimated (a conclusion reached by the AI). Estimated fields cannot serve as the basis for legally significant decisions.
- **Responsibility lies with a human:** The second-life company signs the history with its own key.
- **It gets stronger over time:** As signed real measurements come in from the battery, estimated fields are updated with them; the history is never deleted.

## Cardano integration

The on-chain side is built with ready-made patterns, so the effort goes into the AI part.

- **Cardano Foundation DPP standard, Event Log pattern:** An append-only history to which multiple companies add events throughout the product's life cycle. About 0.25 ADA per batch record. The events the agent extracts are written in this pattern's format, using its example code.
- **Masumi and Sokosumi:** The agent is hired, the fee is held in escrow, the hash of the result is written on-chain, and the escrow is paid out. The fingerprint of the reconstructed history lands on-chain at the same time as the payment.
- **Document hashes:** The hash of each source document is written on-chain; the document itself is stored off-chain.
- **Signature:** The second-life company's signature permanently records on-chain who took responsibility.

**Why Cardano:** The regulation requires passports to travel across the product's lifetime and across multiple companies. Without a shared central authority, it needs a record that no single company can change on its own. Cardano's low and predictable fees also keep costs reasonable for millions of batteries.

## Demo scenario

The battery of a 2020-model electric vehicle will be converted into a home storage system. It has no passport.

1. The second-life company hires the agent on Sokosumi; the fee is locked in escrow on Preprod.
2. Uploaded documents: a label photo, the registration, two service invoices (one in German, one in English), a 2022 dealer health report, and an insurance record summary.
3. The timeline the agent extracted appears on screen: production, first registration, a module replacement in 2021, a health measurement in 2022, an accident in 2023. Each event shows its source and confidence level.
4. The agent raises a warning: the 2022 report states 91% health, but this is inconsistent with the 2021 module replacement.
5. Bonus scene: someone tries to add a piece of information that is not in an invoice as supposedly "documented". The code cannot find the quote in the document and rejects it.
6. The company signs the history, the events are written on-chain, and the escrow is paid. Two real TxHashes are shown.

## Limits and open questions

- **The document itself could be fake.** The system proves what a document says, not that the document is true. Documents digitally signed by a service shop or the manufacturer reduce this risk.
- **Legal acceptance is unclear.** The regulation does not settle whether a reconstructed history would be accepted in place of an "original passport." The project is a proposed solution to this gap, not an official approval.
- **Personal data.** Registration and insurance documents contain personal data. Documents are kept off-chain; only hashes are on-chain. Personal information must be stripped from the events.
- **Passport access rules are not finalized yet.** Implementing decisions that will determine who can access which fields are still pending.
- **To confirm with Masumi:** How the result hash should be linked to the event log; to be discussed with the team at their booth.

## Sources

- Digital Product Passport on Cardano (Cardano Foundation, cardano-dpp-standards)
- EU Digital Product Passport on Cardano: Batteries (Lambda Sistemi)
- Do Recycled Batteries Need a Battery Passport? (Arianee)
- The EU Battery Passport: What Regulation 2023/1542 Requires (BD Emerson)
- The EU Battery Passport Explained (Automotive IQ)
- Masumi: Refunds & Disputes
