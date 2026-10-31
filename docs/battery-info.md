# Battery reference: chemistries, cell compatibility, and German EV batteries

Written for the team. Status date: 31 October 2026. Every section ends with its sources; a claim without a source is marked as such.
**Confirmed** = manufacturer statement or on-the-record trade press. **Reported** = press citing unnamed sources, teardown or spec sites. Where sources disagree, both numbers are given.

Why this document exists: our grouping code ([battery/group.mjs](../battery/group.mjs)) combines cells only when they have the **same cell model and the same chemistry** (`assertOneFamily` stops the draft otherwise). The review screen's default draft (`examples/demo-mixed-draft.json`: 11 packs, 8 cell families, 20 ESS units) shows that rule at work; the chemistry values shown next to each family come from section 2. This file holds the facts behind it and what the German installed base looks like, so the demo data and the pitch stay realistic.

## 1. What this means for our agent

- The packs a German second-life company will receive for the next years are overwhelmingly **NMC, pouch or prismatic, 400 V** (MEB, BMW Gen5, Mercedes EVA2, Stellantis eCMP). LFP is only now entering German brands (Mercedes CLA 200, Ford/MEB Standard Range, ID. Polo 37 kWh). See sections 5–6.
- **Cell models differ even inside one brand and chemistry** (MEB pouch from LG Energy Solution or SK On vs. CATL prismatic modules; PPE prismatic NMC811 vs. Taycan pouch). Our rule "same cell model" is therefore not a technicality: a batch of three "NMC" packs can hold three incompatible cell families.
- **Newer packs have no modules** (PowerCo unified cell cell-to-pack, BMW Gen6, Mercedes MB.EA-L). Our two-step flow (screen modules, then group cells) assumes modules exist. For cell-to-pack designs, the screening step would apply to the whole pack. Worth one sentence in the limits slide.
- Warranty thresholds (section 7) are a useful anchor: brands guarantee **70 %** remaining capacity over 8 years / 160,000 km. Our demo ESS units sit at 86–91 % SoH, which is "repurposed", not "remanufactured" (the EU regulation's recital 17 uses 90 % for remanufacturing).

## 2. Chemistry facts (cell level)

| Chemistry | Nominal V | Charge cut-off | Discharge cut-off | Energy density, cell (Wh/kg) | Cycle life (typical) | Thermal behaviour | Cobalt / nickel | Where it is used |
|---|---|---|---|---|---|---|---|---|
| **NMC** (generic) | 3.60–3.70 V | 4.20 V | 3.00 V (abs. min 2.50 V) | 150–220 (dated table); 180–300 by grade | 1,000–2,000; 18650 tests 200–2,500 full cycles to 80 % depending on conditions | self-heating onset 90–110 °C, critical 170–190 °C, 20–25 kJ/Ah (NMC811, ARC) | both; cobalt falls from 532 to 622 to 811 | dominant outside China; VW MEB (NCM712 pouch), BMW Gen5 (NMC811 prismatic), Mercedes EQS (NCM811) |
| NMC 811 example: LG M50 | 3.63 V | 4.20 V | 2.50 V | 267 | about 1,000 (model) | lowest thermal stability in the NMC family | 10 % Co of transition metal | Tesla 4680 (NMC811) 232–244 Wh/kg |
| **NCA** | 3.60 V (3.7 V in some tables) | 4.20 V | 3.00 V (min 2.50 V) | 200–260 (up to 322 in literature) | 500–1,500 | 18650 ARC: runaway onset 207 °C vs 233–234 °C for LFP/LTO; peak 579 °C vs 310–338 °C | about 84 % Ni, about 9 % Co | Tesla (Panasonic cylindrical) |
| **LFP** | 3.20–3.30 V | 3.65 V | 2.50 V (min 2.00 V) | 90–190; EVE LF280K about 172 (from datasheet); CATL claims 205 | 2,000+; EVE LF280K 6,000+ at 25 °C to 80 %; 18650 tests 2,500–9,000 | self-heating onset 150–170 °C, critical 230–260 °C, 10–15 kJ/Ah; smoke but no fire in overcharge tests | none / none | entry trims (Mercedes CLA 200, Ford/MEB Standard Range, Tesla Model Y RWD Berlin); over half of EV batteries deployed worldwide in 2025 |
| **LMFP** | 3.75 V | 4.2 V | 2.5 V | 230–240 | 4,000 claimed (unverified) | olivine structure, safety close to LFP | none | emerging; candidate for VW unified cell mid-range |
| **LMO / LMO-NMC blends** | 3.70–3.80 V (Samsung SDI 94 Ah: 3.68 V, 2.7–4.15 V) | 4.20 V | 3.00 V | 100–165 | 300–700 pure LMO; SDI 94 Ah 3,200 cycles to 80 % | 250 °C (dated table) | blend about 30 % LMO + NMC | Nissan Leaf, Chevrolet Volt, BMW i3 |
| **Sodium-ion** | 3.0–3.1 V | 3.95 V | 1.5–2.0 V (some cells dischargeable to 0 V) | 111–175 (CATL Naxtra claim 175) | 4,000+ to 70 %; CATL claims 10,000+ | onset 135–165 °C; slower temperature rise than Li-ion in one study | no cobalt (Fe/Mn/Ni oxide) | first EVs in China (JAC Yiwei 2023) |

Caveats: Battery University tables are estimated averages (January 2024) and lag current cells; literature ranges span datasheets and tests of different formats; onset temperatures depend on method, format and state of charge, so compare only within one study.

What the review screen shows per family (nominal / charge cut-off): NMC 3.6–3.7 V / 4.2 V, NCA 3.6 V / 4.2 V, LFP 3.2 V / 3.65 V, LMFP 3.7–3.8 V / 4.2 V. Those values come from this table.

Sources: https://batteryuniversity.com/article/bu-216-summary-table-of-lithium-based-batteries · https://batteryuniversity.com/article/bu-205-types-of-lithium-ion · Hasselwander et al., Batteries 2023, 9, 379, Table 1: https://elib.dlr.de/196049/1/batteries-09-00379-v2.pdf · Preger et al., J. Electrochem. Soc. 167 (2020) 120532: https://iopscience.iop.org/article/10.1149/1945-7111/abae37 · Schöberl et al. (TUM/KIT), J. Power Sources 2025/2026, tabulated at https://www.batterydesign.net/objective-safety-analysis-of-nmc-vs-lfp/ · Ubaldi & Russo, Chem. Eng. Trans. 104 (2023): https://www.cetjournal.it/cet/23/104/009.pdf · LG INR21700 M50 datasheet: https://lygte-info.dk/review/batteries2012/LG%2021700%20M50%205000mAh%20(Grey)%20UK.html · https://www.batterydesign.net/tesla-4680-cell/ · EVE LF280K datasheet: https://akkudoktor.net/uploads/short-url/maYfKTLNOcRNqlYZNRluaz43RTL.pdf · https://en.wikipedia.org/wiki/Lithium_iron_phosphate_battery · https://www.batterydesign.net/chemistry/lithium-ion-chemistry/lithium-manganese-iron-phosphate/ · Samsung SDI 94 Ah: https://www.mikrocontroller.net/attachment/491363/SDI94Ah.pdf · https://en.wikipedia.org/wiki/Sodium-ion_battery · https://www.batterydesign.net/hina-nacr32140-mp10/ · https://www.iea.org/reports/global-ev-outlook-2026/electric-vehicle-batteries · https://www.ornl.gov/publication/overcharge-thermal-runaway-behavior-and-safety-assessment-commercial-lithium-ion-cells · https://www.ess-news.com/2025/06/20/comparing-thermal-runaway-behavior-of-sodium-ion-lithium-ion-batteries/

## 3. Why cells of different chemistries or models are never combined

This is what `assertOneFamily` in [battery/group.mjs](../battery/group.mjs) enforces, and what the tests in [battery/family.test.mjs](../battery/family.test.mjs) check.

**Different chemistries in one series string or module**

1. **Incompatible voltage windows.** A series string sees one charger and one BMS cut-off. LFP must stop at 3.65 V, NMC/NCA at 4.20 V, sodium-ion at 3.95 V with a 1.5 V floor. Li-ion protection circuits are built around one chemistry's limits; applied to an LFP cell they allow about 0.6 V of overcharge, applied to an NMC cell they strand about 15 % of its capacity. Battery University: "never mix different makes and sizes", "a battery is only as strong as the weakest link", "cells in multi-packs must be matched".
2. **Different open-circuit-voltage curves break state-of-charge estimation and balancing.** LFP's voltage is nearly flat between about 30 and 80 % SoC with about 38 mV hysteresis; NMC is nearly linear above about 15 % SoC. A BMS uses one voltage table per cell type; a mixed string has none. Research on deliberately hybrid LFP+NMC packs concludes that per-cell state estimation is the key problem, i.e. it needs per-cell models, not a standard BMS.
3. **Over- or under-charge of the minority chemistry.** In series the same current flows through every cell: the cell with the lower cut-off is overcharged (heat, lithium plating), the lower-capacity cell is driven towards reverse polarity on discharge.
4. **Different thermal behaviour.** Self-heating onset 90–110 °C (NMC811) vs 150–170 °C (LFP); energy release 20–25 vs 10–15 kJ/Ah. Cooling, propagation barriers and UL 9540A results are designed for one cell type. A 2025 review: safety risks "are further exacerbated when cells with diverse chemistries, aging levels, or manufacturers are mixed within the same second-life system".
5. **Standards assume one defined cell.** IEC 62619:2022 covers first life only. IEC 63330-1:2024 (repurposing) requires data traceability per product. UL 9540A testing starts at cell level. UN 38.3 qualification is per cell type; a change of chemistry, mass, design, capacity or nominal voltage requires requalification. No accessible standard defines a mixed-chemistry string as a testable product.

**Same chemistry, different cell model**

- **Series: the weakest cell sets capacity and ages fastest.** In a mismatched string the weak cell empties first and is pushed into reverse polarity by its neighbours; on charge it fills first and overcharges. A Battery University experiment with 5 / 6 / 7 / 12 % mismatch showed the 12 % case degrading fastest within 18 cycles.
- **Parallel: resistance mismatch means current imbalance, heat, ageing.** A 20 % difference in internal resistance between two cells cycled in parallel reduced cycle life by about 40 % (MIT; confirmed by Bruen & Marco).
- **Different models have different datasheet limits even in one chemistry.** Samsung SDI 94 Ah: 2.7–4.15 V, 3.68 V nominal; LG M50 (NMC811): 2.5–4.2 V, 3.63 V. Both are "NMC". Charge cut-offs, maximum C-rates, temperature windows and cycle-life curves are model-specific.
- **Different ageing curves.** Degradation trends are chemistry- and model-specific and "should not be broadly extrapolated"; even 48 identical cells show a spread that "cannot be ignored", and the spread grows in real vehicle use.
- **Format and mechanical integration.** Prismatic cells need face pressure, pouch cells need support and controlled surface pressure, cylindrical cells pack hexagonally; fixtures, busbars and cooling plates are format- and dimension-specific. Apart from VDA PHEV2 there is little standardisation even among prismatic cells.

**How much cell-to-cell variation is normal, and which tolerances are used**

- New cells from one batch: capacity coefficient of variation 0.35 % at 0.04C / 25 °C, rising to 4.78 % at 1C / −20 °C (5,473-cell survey); 19 LG M50T cells: mean 4.86 Ah, standard deviation about 0.7 %.
- Industrial matching: capacity tolerance "+/- 2.5 percent", tighter for high-voltage or heavy-load packs (Battery University); vendor practice ±2 % professional bins.
- Second-life reality (practitioner data): recovered 18650/21700 cells show 5–15 % capacity and 20–80 % resistance spread.
- UL 1974 workflow: open-circuit voltage, isolation, capacity, internal resistance at two SoC points, BMS check, cycle test, self-discharge; capacity sorting into 5 % bins of nominal.
- Literature criteria: reject when internal resistance exceeds 1.5× initial; a 2026 study excludes resistance above 150 % of nominal and SoH below 70 %, then clusters on discharged capacity and mean resistance; contact resistance alone perturbs readings by up to ±20 %.
- GB/T 34015.3-2021 (China, echelon use): register manufacturer and model at intake; retired batteries "with the same model may be classified by capacity level".

**What this means for our rules.** No standard fixes a universal percentage. The range seen in practice is capacity within ±2–5 % and internal resistance within about ±10 % (tighter for high-rate use), with voltage and self-discharge screens on top, and only among cells of one model, because a tolerance is meaningless across models with different nominal capacity, resistance and voltage limits. Our [battery/config.mjs](../battery/config.mjs) uses ±2 % capacity and ±10 % resistance inside one family. Self-discharge is not measured in the demo data yet (open item).

Sources: https://batteryuniversity.com/article/bu-803a-cell-mismatch-balancing · https://batteryuniversity.com/article/bu-302-series-and-parallel-battery-configurations · https://accure.net/battery-knowledge/lfp-soc-estimation-challenges · https://www.accure.net/blogs/battery-hysteresis-effect · https://ifatwww.et.uni-magdeburg.de/ifac2020/media/pdfs/3364.pdf · https://www.mdpi.com/1996-1073/18/23/6371/html · Zhang et al., arXiv:2512.01294: https://arxiv.org/pdf/2512.01294 · IEC 62619 scope: https://standards.iteh.ai/catalog/standards/clc/bc812267-3c62-4175-b93e-c91120c8abad/en-62619-2017 · IEC 63330-1:2024 preview: https://assets.vde-verlag.de/iec-normen/preview-pdf/info_iec63330-1%7Bed1.0%7Db.pdf · https://www.ul.com/services/UL-9540A-test-method · https://www.spilma.com/en/guides/iec-62133-un-38-3-battery-safety-transport · Ayala et al., arXiv:2504.00963: https://arxiv.org/pdf/2504.00963 · Gogoana et al., J. Power Sources 252 (2014): https://www.mit.edu/~bazant/papers/pdf/Gogoana_2013_J_Power_Sources.pdf · Bruen & Marco (2016): https://wrap.warwick.ac.uk/id/eprint/76878 · Baumhöfer et al., J. Power Sources 247 (2014): https://cris.fau.de/publications/320896970 · An et al., Sci. Rep. 6, 35051 (2016): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5057166/ · https://www.batterydesign.net/battery-cell/formats/ · https://www.batterydesign.net/vda-prismatic-cells/ · Chung, UL 1974 profiles: https://engrxiv.org/preprint/download/1274/version/1953/2651/1942 · Olivero-Ortiz et al., PLOS One 21(7) (2026): https://pmc.ncbi.nlm.nih.gov/articles/PMC13374983/ · Lai et al., Renew. Sustain. Energy Rev. 146 (2021) 111162 · GB/T 34015.3-2021: https://www.chinesestandard.net/PDF-EN/GBT34015.3-2021EN-P06P-H5002H-034661.pdf

## 4. Second-life standards and the EU Battery Regulation

- **UL 1974** (ANSI/CAN/UL 1974:2023, 2nd edition, 9 November 2023): "Evaluation for Repurposing or Remanufacturing Batteries". Covers sorting and grading of packs, modules and cells originally configured for other purposes; the 2023 edition adds remanufactured batteries and bars repurposing components past the OEM calendar expiry.
- **IEC 63330-1:2024** "Repurposing of secondary batteries, Part 1: General requirements" (June 2024): procedure to evaluate performance and safety of used cells, modules, packs and systems from applications such as EVs; targets products "with data traceability"; classification by performance level. Companion guidance: IEC 63338:2024.
- **IEC 62619:2022 / IEC 62620**: industrial Li-ion safety and performance for stationary use; 62619 states it covers first life only. A repurposed ESS still has to meet 62619 at system level, which is why the repurposer becomes the manufacturer of a new product.
- **SAE J2997** (J2997_202606, 24 June 2026): recommended practice on BEV battery data retention and design for reuse and serviceability.
- **Germany, VDE V 0510-100 (2023, DKE)**: requirements for using vehicle batteries as stationary storage in industrial environments; covers the complete battery, module-level reuse explicitly deferred; basis for a CENELEC standard under mandate M/579.
- **UL 9540A:2025**: thermal-runaway fire-propagation test at cell, module, unit and installation level.
- **Regulation (EU) 2023/1542** (primary text: https://eur-lex.europa.eu/eli/reg/2023/1542/oj; EUR-Lex blocked automated access during this research, so the wording below is reproduced from secondary sources and **must be checked against EUR-Lex before it goes on a slide**):
  - Article 77 battery passport applies from **18 February 2027** to LMT batteries, industrial batteries above 2 kWh and EV batteries. Regulation (EU) 2025/1561 postponed only the Chapter VII due-diligence duties, not the passport.
  - **Article 77(7)** (as reproduced): "For a battery that has been subject to preparation for re-use, preparation for repurposing, repurposing or remanufacturing, the responsibility for the fulfilment of the obligations under paragraph 4 of this Article shall be transferred to the economic operator that has placed that battery on the market or put it into service. Such battery shall have a new battery passport linked to the battery passport or passports of the original battery." An ESS built from repurposed EV cells therefore needs its own passport, linked to the donors' passports. Donors placed on the market before 2027 never had one: that is the gap our project addresses.
  - **Article 77(8)** (as reproduced): "A battery passport shall cease to exist after the battery has been recycled."
  - Definitions of repurposing, remanufacturing and state of health are in Article 3; Article 73 covers preparation for re-use and repurposing of waste batteries.
  - **Annex VII** (state of health and expected lifetime), as summarised by a secondary source: Part A, EV batteries: state of certified energy (SOCE); stationary storage and LMT batteries: remaining capacity and evolution of self-discharge, and where possible remaining power capability, round-trip efficiency and ohmic resistance. Part B: date of manufacture and of putting into service, energy and capacity throughput, harmful events, full equivalent cycles. These data must be held in the BMS under Article 14(1) since 18 August 2024.

Sources: https://scc-ccn.ca/standardsdb/standards/4032178 · https://www.ul.com/resources/ul-1974-creating-safe-second-life-electric-vehicle-batteries · https://scc-ccn.ca/standardsdb/standards/2054422 · https://online.standard.no/en/iec-63338-2024-ed1 · https://saemobilus.sae.org/standards/j2997_202606-standards-battery-secondary-use · https://www.dke.de/en/areas-of-work/mobility/news/second-use-and-second-life-for-electric-car-batteries · https://scc-ccn.ca/standardsdb/standards/4033513 · https://www.reuschlaw.de/en/news/two-years-of-the-battery-regulation-developments-to-date-and-what-lies-ahead/ · https://www.arianee.com/en/blog/do-recycled-batteries-need-a-battery-passport · https://www.compliancegate.com/eu-batteries-regulation-timeline-and-dates/ · https://www.lexaris.de/library/tableofcontents/4633453 · https://docs.rs/crate/dpp-rules/0.12.0/source/src/batteries/degradation.rs (secondary) · primary, to verify: https://eur-lex.europa.eu/eli/reg/2023/1542/oj

## 4a. Cell formats found in German EVs

**Prismatic (VDA sizes; DIN SPEC 91252 withdrawn, replaced by DIN 91252:2016-11)**

| VDA format | W × H × T (mm) |
|---|---|
| HEV | 120 × 85 × 12.5 |
| PHEV1 | 173 × 85 × 21 |
| PHEV2 | 148 × 91 × 26.5 |
| PHEV2+ | 148 × 125 × 26.5 |
| BEV1 | 173 × 115 × 32 |
| BEV2 | 173 × 115 × 45 |

Only PHEV2 is widely standardised; tab height varies by maker. Examples: Samsung SDI 94 Ah (BMW i3) 173 × 125 × 45 mm, 2.1 kg; BMW Gen5 prismatic NMC811 from Samsung SDI and CATL (e.g. CATL 116 Ah, 301.7 × 26.5 × 91 mm); VW PowerCo unified cell: prismatic with identical outer dimensions across LFP, manganese-rich and NMC chemistries.

**Pouch**: no dimensional standard. LG E66A (NCM712, Taycan): 65 Ah, 350 × 104 × 11.7 mm, 897 g, 259 Wh/kg; LG E78 (NCM712, VW MEB): 78 Ah, 3.65 V, 1,073 g, 265 Wh/kg; MEB modules hold 24 cells (8s3p). Pouch cells need external compression and support.

**Cylindrical**: 2170/21700 (21 × 70 mm; Tesla Model 3/Y, LG M50 family); 4680 (46 × 80 mm, 22–23 Ah, NMC811, 232–244 Wh/kg); BMW Gen6 46 mm cells in two heights, 4695 (120–140 Wh) and 46120 (148–180 Wh), suppliers CATL and EVE.

Sources: https://www.dinmedia.de/en/standard/din-91252/257577688 · https://www.batterydesign.net/vda-prismatic-cells/ · https://pushevs.pages.dev/2017/02/20/details-samsung-sdi-94-ah-battery-cell · https://pushevs.pages.dev/2021/03/30/ncm-712-by-lg-chem-e66a-and-e78-battery-cells · https://www.batterydesign.net/bmw-gen5-battery-system/ · https://evreporter.com/technical-analysis-of-unified-cell-by-powerco-volkswagen/ · https://cleantechnica.com/2020/05/13/everything-you-ever-wanted-to-know-about-the-volkswagen-meb-battery-pack-and-more/ · https://www.batterydesign.net/tesla-4680-cell/ · https://newsroom.bmwgroup.com/global/more-performance-co2-reduced-production-significantly-lower-costs-bmw-group-to-use-innovative-round-bmw-battery-cells-in-neue-klasse-from-2025 · https://www.batterydesign.net/bmw-gen6-battery-system/

## 5. German brands: platforms, chemistries, cells, suppliers

### Volkswagen Group (VW, Audi, Porsche, Cupra/Škoda; Ford Cologne builds on MEB)

- **MEB (400 V)**: ID.3, ID.4, ID.5, ID.7, ID. Buzz, Cupra Born, Škoda Enyaq/Elroq, Ford Explorer/Capri. Packs 45/52/58 kWh (ID.3), 77 kWh net (82 gross), 86 kWh net (ID.7 Pro S). VW (2021): 45 kWh = 7 modules, 52 = 8, 58 = 9, 77 = 12 modules; **24 pouch cells per module**. Packs assembled in Braunschweig; Ford assembles its own MEB packs in Cologne since June 2025. *Confirmed (modules, cells per module).*
- **MEB cells**: NMC. Suppliers for Europe are reported as LG Energy Solution (Wrocław) and SK On (Hungary) pouch cells, with CATL prismatic modules in some packs. VW itself only says cells "are made by a supplier". *Reported.* A March 2026 KBA recall of about 94,000 MEB cars (built Feb 2022–Aug 2024) concerns out-of-spec modules; the cell maker was not named.
- **First LFP in MEB**: January 2026, Ford Explorer/Capri Standard Range moved from 52 kWh NMC to 58 kWh LFP (supplier not named).
- **MEB+ / MEB Entry (400 V)**: ID. Polo and Cupra Raval, series production in Martorell since June 2026. 52 kWh net NMC pack with PowerCo's **unified cell** in a cell-to-pack layout (no modules); 37 kWh LFP entry pack.
- **PPE (800 V)**: Audi Q6/SQ6 e-tron, A6 e-tron, Porsche Macan Electric. Audi (2024): 100 kWh gross / 94.9 net, **12 modules × 15 prismatic cells = 180 cells**, NMC about 8:1:1; the smaller pack has 10 modules / 150 cells. Macan Electric used CATL Arnstadt NMC811 prismatic cells exclusively; Samsung SDI now supplies Macans sold in South Korea (MY2026). *Confirmed.*
- **J1 (800 V)**: Taycan. LG Energy Solution pouch cells. Pre-facelift Performance Battery Plus: 93.4 kWh gross, **33 modules × 12 cells = 396 cells**; the 79.2 kWh pack had 28 modules. 2024 facelift: 105 kWh gross / 97 net. *Confirmed (Porsche newsroom).*
- **SSP**: delayed; May 2026 reporting puts SSP cars at 2028 or later. *Plan.*
- **Second life / recycling**: VW Group Components Salzgitter recycling pilot since January 2021 (up to 3,600 packs/year; packs are checked for second-life suitability first). Elli's 20 MW Salzgitter grid storage (March 2026) uses **new** PowerCo cells; Elli calls packs at 70–80 % remaining capacity second-life candidates. Audi: 4.5 MWh storage with RWE in Herdecke from 60 used Audi packs; pilot with EnBW in Heilbronn. Porsche: 5 MW / 10 MWh storage at Plant Leipzig built from **4,400 Taycan modules** from pre-series and test cars (2024).

Sources: https://emobilityplus.com/2021/05/11/long-range-and-rapid-charging-the-battery-system-is-at-the-heart-of-the-volkswagen-id-3-id-4-and-id-4-gtx/amp/ · https://www.batterydesign.net/volkswagen-meb-battery-pack-id-family/ · https://www.electrive.net/2026/03/24/vw-muss-fast-100-000-meb-stromer-zurueckrufen/ · https://www.electrive.com/2026/01/28/ford-explorer-and-capri-receive-new-lfp-battery-option · https://www.electrive.com/2025/06/12/ford-kicks-off-battery-pack-production-in-cologne/ · https://www.volkswagen-newsroom.com/en/publications/more/the-new-id-polo-fact-sheet-3137/download · https://www.electrive.com/2025/12/15/vw-id-polo-to-launch-in-four-power-levels · https://www.audi.com/en/press-releases/high-performance-compact-and-intelligent-the-high-voltage-battery-for-the-premium-platform-electric-15926 · https://www.electrive.com/2026/02/10/porsche-switches-cell-suppliers-for-the-macan-electric-to-samsung-sdi/ · https://newsroom.porsche.com/en/products/taycan/battery-18557.html · https://www.electrive.com/2024/02/07/porsche-extensively-updates-the-taycan · https://www.motor.es/noticias/volkswagen-id-golf-electrico-descarte-2028-2026114158.html · https://www.volkswagengroup.it/en/media/press-releases/transforming-old-into-new-volkswagen-group-components-commences-battery-recycling · https://www.automotiveworld.com/news/volkswagen-makes-grid-storage-play-with-elli-site-launch/ · https://www.energy-storage.news/decommissioned-audi-ev-batteries-used-in-4-5mwh-stationary-energy-storage-system-in-germany · https://www.enbw.com/press/second-life-batteries.html · https://electriccarsreport.com/2024/08/used-taycan-batteries-became-a-battery-storage-system-for-the-leipzig-plant/

### BMW Group (BMW, Mini)

- **Gen5 (400 V, prismatic NMC811, modules)**: iX3 (G08), i4, iX, i7, i5, iX1/iX2, Mini Countryman E/SE (Leipzig, 66.5 kWh). Cells from **CATL (Arnstadt) and Samsung SDI**. Modules and packs assembled in Dingolfing, Leipzig, Regensburg. i4 (83.9 kWh gross): 4 modules × 72 cells + 3 modules × 12 cells = 324 cells. *Reported (third-party), not an official BMW figure.*
- **Gen6 "Neue Klasse" (800 V, 46 mm cylindrical cells, cell-to-pack, no modules)**: iX3 (NA5), series production in Debrecen since late October 2025; BMW i3 sedan in Munich with packs from the new **Irlbach-Straßkirchen** plant (series production since October 2026; 108.7 kWh pack). BMW states about 20 % higher energy density than Gen5. Cells are bought in: CATL and EVE Energy framework agreements (2022) for 4695/46120 cells; Samsung SDI 46120 production in Göd (Hungary) for BMW is reported. Parsdorf is BMW's own Gen6 pilot plant, not a volume cell factory.
- **Mini**: Cooper E/SE (40.7 / 54.2 kWh) and Aceman are built by Spotlight (BMW/Great Wall JV) in China; cell supplier not disclosed.
- **Second life / recycling**: Leipzig "battery farm" with used and new i3 packs (since 2017); BMW + Encory commissioned a direct-recycling Cell Recycling Competence Center in Salching in December 2025.

Sources: https://www.batterydesign.net/bmw-gen5-battery-system/ · https://www.electrive.com/2021/05/26/bmw-launches-battery-production-for-ix-i4 · https://en.wikipedia.org/wiki/BMW_i4 · https://www.electrive.com/2025/09/17/bmw-to-start-ix3-series-production-in-debrecen-in-october · https://www.electrive.com/2026/10/02/bmw-begins-gen6-battery-production-in-irlbach-straskirchen/ · https://www.visit-bmwgroup.com/en/bmw-group-series-production-of-new-high-voltage-batteries/ · https://cnevpost.com/2022/09/09/eve-energy-battery-cell-supply-deal-with-bmw/ · https://www.electrive.com/2023/08/08/samsung-sdi-to-produce-46120-cells-for-bmw-in-goed · https://electrive.com/2024/03/01/mini-countryman-electric-is-now-in-series-production · https://www.gardnerweb.com/news/bmw-puts-used-ev-batteries-to-work · https://www.press.bmwgroup.com/portugal/article/detail/T0454563PT/up-and-running-bmw-group-and-encory-launch-innovative-direct-recycling-to-recover-battery-raw

### Mercedes-Benz (incl. smart)

- **EVA2 (400 V)**: EQS, EQE, EQS SUV, EQE SUV. EQS: 107.8 kWh usable, **12 modules** (90 kWh version: 10), "pouch and hardcase cells", NCM811, packs built in Hedelfingen. EQE 90.6 kWh: reported 10 modules / 360 pouch cells. Suppliers (Mercedes Korea disclosure, August 2024): Farasis for several EQE variants, CATL for EQE 300 / EQE SUV 350 and the EQS; EQA/EQB: SK On (some CATL); EQC: LG Energy Solution. *Confirmed (modules, suppliers in Korea).*
- **MMA (800 V)**: CLA (Rastatt, Kecskemét), CLA Shooting Brake, GLB. 85 kWh usable NMC with **prismatic CATL cells**; 71 kWh NMC (February 2026); 58 kWh **LFP** in CLA 200 (BYD Blade reported in 2023, never named by Mercedes). All three packs: **192 prismatic cells in 4 modules**. Packs from Accumotive Kamenz. Samsung SDI's first Mercedes NMC contract (April 2026) is for MMA models from 2028. *Plan.*
- **MB.EA-M (800 V)**: GLC with EQ technology (Bremen, ramping 2026), 94 kWh net, silicon-oxide anode. **MB.EA-L** (from about 2028): module-less packs with 46-series cylindrical cells, LG Energy Solution contracts of 50.5 GWh (2024) and 107 GWh (2025). *Plan.*
- **smart #1/#3/#5**: Geely SEA platform, built in China; #5 Pro has 74.4 kWh LFP; suppliers not confirmed.
- **ACC** (Mercedes holds 33 %): the Kaiserslautern cell plant was definitively shelved in February 2026; Mercedes has never sourced cells from ACC.
- **Second life / recycling**: Mercedes-Benz Energy second-life storage in Lünen (about 13 MWh from 1,000 smart ED modules, 2016), spare-parts storage at Elverlingsen (9.8 MWh) and Hannover (17.4 MWh) with GETEC/The Mobility House. Kuppenheim recycling plant opened October 2024: 2,500 t/year, over 96 % recovery claimed.

Sources: https://insideevs.com/news/496439/mercedes-starts-production-battery-systems-eqs/ · https://electrive.com/2021/03/23/daimler-launches-eqs-battery-production · https://insideevs.de/news/499098/mercedes-eqs-mehr-technische-daten/ · https://mbpassion.de/2024/08/mercedes-verraet-nach-brand-seine-zelllieferanten/ · https://www.electrive.com/2024/08/14/south-korea-wants-carmakers-to-disclose-battery-suppliers · https://www.electrive.com/2026/02/13/mercedes-introduces-fourth-cla-powertrain-variant/ · https://www.electrive.com/2023/09/14/mercedes-electric-cla-to-use-lfp-cells-from-byd · https://www.electrive.com/2026/04/20/mercedes-purchases-battery-cells-from-samsung-sdi/ · https://ecomento.de/2025/07/10/mercedes-accumotive-in-kamenz-produziert-batterien-fuer-neuen-elektro-cla/ · https://www.electrive.com/2025/09/03/mercedes-purchases-107-gwh-of-batteries-from-lg-energy-solution · https://insideevs.de/news/620509/smart-1-plattform-geely-2022/ · https://www.electrive.com/2026/02/09/acc-permanently-abandons-battery-projects-in-germany-and-italy/ · https://www.mobilityhouse.com/int_en/our-company/newsroom/article/elverlingsen-battery-storage-plant · https://www.electrive.net/2018/06/21/daimler-kohlekraftwerk-wird-zu-automobilem-batteriespeicher/ · https://battery-news.de/en/2024/10/22/mercedes-benz-opens-battery-recycling-plant/

### Opel (Stellantis)

- **eCMP / CMP (400 V)**: Corsa Electric, Mokka Electric, Frontera: 50/51 kWh gross NMC. The shared Peugeot e-208/Corsa-e pack is described as **CATL prismatic, 216 cells (2P108S) in 18 modules** by a service document and batterydesign.net, while Automobile Propre quotes **102 cells / 17 modules**: the counts conflict.
- **eCMP2 (400 V)**: Astra Electric (built in Rüsselsheim): 54 kWh gross / 51 net, **102 cells in 17 modules**, NMC811. *Confirmed (Opel/electrive 2022).*
- **STLA Medium (400 V)**: Grandland Electric (built in Eisenach): 73 / 82 / 97 kWh net. Cells reported as NMC from ACC Douvrin; ACC's low yield reportedly limits output. Stellantis also plans CATL LFP cells from a Zaragoza plant under construction. *Plan.*
- Stellantis buys from ACC, CATL, BYD, SVOLT, Samsung SDI and LG Energy Solution and does not disclose the supplier per model.
- **Second life / recycling**: SUSTAINera repurposes packs (e.g. Enel X storage at Rome airport); the Stellantis–Orano recycling JV was an MoU (October 2023) with a 2026 target; no 2026 confirmation found.

Sources: https://www.batterydesign.net/peugeot-e-208/ · https://www.automobile-propre.com/articles/peugeot-e-208-quelle-est-la-vraie-capacite-de-sa-batterie/ · https://www.electrive.com/2022/11/30/premiere-of-the-opel-astra-electric-the-range-is-complete · https://insideevs.de/news/740851/opel-grandland-electric-marktstart/ · https://www.electrive.com/2023/11/21/stellantis-and-catl-aim-for-battery-deal-and-joint-venture · https://www.automotiveworld.com/news-releases/second-life-batteries-from-sustaineras-circular-economy-powering-innovative-non-automotive-mobility-solutions-the-avathor-one-application · https://www.dbusiness.com/daily-news/stellantis-frances-orano-to-form-ev-battery-recycling-joint-venture/

## 6. Typical module and cell counts (for disassembly planning)

| Pack | Modules | Cells | Format / chemistry | Voltage | Confidence |
|---|---|---|---|---|---|
| VW MEB 77 kWh (ID.3/4/5, Born, Enyaq) | 12 | 24 per module = 288 | pouch NMC (LGES / SK On); some CATL prismatic modules | 400 V | VW official (modules, cells per module); supplier split reported |
| VW MEB 58 / 52 / 45 kWh | 9 / 8 / 7 | 24 per module | pouch NMC | 400 V | VW official |
| VW MEB+ ID. Polo 52 kWh | none (cell-to-pack) | not published | PowerCo prismatic unified cell, NMC | 400 V | VW / press |
| PPE 100 kWh (Q6 e-tron, Macan) | 12 | 15 per module = 180 | prismatic NMC811 (CATL Arnstadt) | 800 V | Audi official |
| PPE 83 kWh | 10 | 150 | prismatic NMC | 800 V | Audi official |
| Taycan 93.4 kWh (pre-2024) | 33 | 12 per module = 396 | pouch NMC (LGES) | 800 V | Porsche official |
| Taycan 79.2 kWh | 28 | 336 | pouch NMC | 800 V | Porsche official |
| BMW i4 83.9 kWh (Gen5) | 4 × 72 cells + 3 × 12 cells | 324 | prismatic NMC811 (Samsung SDI / CATL) | 400 V | third-party |
| BMW Gen6 (iX3, i3; 108.7 kWh) | none (cell-to-pack) | not published | 46xx cylindrical NMC | 800 V | BMW official (format) |
| Mercedes EQS 108 kWh | 12 (90 kWh: 10) | not published | pouch + hardcase NCM811 | 400 V | Mercedes official (modules) |
| Mercedes EQE 90.6 kWh | 10 | 360 pouch | NCM (Farasis / CATL) | 400 V | reported |
| Mercedes CLA 85 / 71 / 58 kWh | 4 | 192 | prismatic NMC (CATL) / LFP | 800 V | electrive |
| Opel Astra Electric 54 kWh | 17 | 102 | NMC811 | 400 V | Opel / electrive |
| Opel Corsa-e / e-208 50 kWh | 18 (or 17) | 216 (or 102): sources conflict | prismatic NMC (CATL) | 400 V | third-party |

For comparison, our demo packs have 8 modules × 12 cells (invented, small on purpose).

Sources: as in section 5.

## 7. HV battery warranty terms (Germany / Europe, new cars)

| Brand | Term | Minimum remaining capacity | Notes |
|---|---|---|---|
| Volkswagen (ID.) | 8 years / 160,000 km | 70 % net usable capacity | VW AG Germany warranty document |
| Audi (BEV) | 8 years / 160,000 km | staged: e-tron 78 / 74 / 70 % at 3 / 5 / 8 years; e-tron GT 80 % then 70 % | Audi warranty PDF (2021) |
| Porsche (Taycan, Macan) | 8 years / 160,000 km | 80 % for 3 years / 60,000 km, then 70 % | Porsche dealer / regional pages |
| BMW / Mini | 8 years / 160,000 km | 70 % | BMW / Mini battery certificates |
| Mercedes EQS / EQE | 10 years / 250,000 km | 70 % | Mercedes certificate (2024) |
| Mercedes EQA / EQB / EQC | 8 years / 160,000 km | not stated on the page found | Mercedes Ireland warranty page |
| Mercedes CLA / GLC EQ | not found officially; third parties list 8 years / 160,000 km | — | verify with Mercedes DE terms |
| Opel (all BEV) | 8 years / 160,000 km | 70 % | Opel / Stellantis warranty pages |
| Ford Explorer / Capri | 8 years / 160,000 km | "excessive loss of capacity", no % published | Ford DE Power Promise |

Sources: https://www.volkswagen.de/idhub/content/dam/onehub_master/pc/offers-and-products/garanties/2019_05_BEV_Garantie_der_Volkswagen_AG_im_Markt_Deutschland.pdf · https://content.my.audi.com/service/asset/pdf/warranty/warranty_de_DE.pdf · https://dealer.porsche.com/gb/porschecentrepreston/en-GB/News-and-Events/News/Macan-Facts · https://www.bmw.ch/content/dam/bmw/marketCH/bmw_ch/de_CH/topics/electric-cars/BMW_QZ_fur_HVB_de.pdf.asset.1764847977092.pdf · https://mbpassion.de/2024/04/mercedes-benz-passt-eqe-eqs-batteriezertifikate-und-wartungsservice-an/ · https://www.mercedes-benz.ie/services/warranty/ · https://www.opel.ie/content/dam/opel/ireland/owners/warranty-pdfs/OpelWarrantyServicingSummaryPassenger.pdf · https://fordauthority.com/2025/06/ford-power-promise-brings-ev-incentive-package-to-germany/

## 8. Cell manufacturing and recycling in Germany (status October 2026)

| Site | Status |
|---|---|
| PowerCo Salzgitter (VW) | **Producing**: first unified cells 17 December 2025, NMC first, LFP to follow; ramp through 2026 toward 20 GWh (expandable to 40 GWh); cells for ID. Polo / Cupra Raval |
| CATL Arnstadt (near Erfurt) | **Producing** since January 2023, 14 GWh design; prismatic NMC for BMW Gen5 and VW PPE |
| Tesla Grünheide | Pack assembly only; 4680 cell production announced for 2027 (18 GWh plan, May 2026) |
| Northvolt Heide | **No factory built**; Lyten agreed to buy the site (2026), production target 2028 |
| ACC Kaiserslautern | **Definitively shelved** (February 2026) |
| BMW Parsdorf / Irlbach-Straßkirchen | Parsdorf = Gen6 pilot plant; Irlbach-Straßkirchen = Gen6 **pack** assembly since October 2026, cells bought in |
| Mercedes Kamenz / Hedelfingen / Bremen | Pack assembly only; no own cell production |

Recyclers: BASF Schwarzheide black-mass plant commercial since June 2025 (15,000 t/year); Cylib: Dormagen hydrometallurgical plant under construction (start 2027), plus a 10,000 t/year mechanical plant in Bavaria (Q4 2026); Duesenfeld Wendeburg 3,000 t/year demonstration plant; Li-Cycle Magdeburg now owned by Glencore (August 2025), plans unclear.

Sources: https://battery-news.de/en/2025/12/18/volkswagen-launches-cell-production-in-salzgitter/ · https://www.batterydesign.net/powerco-unified-cell/ · https://electrive.com/2022/12/22/catl-kicks-off-cell-production-in-germany · https://www.electrive.com/2026/05/13/tesla-expands-grunheide-battery-cell-plans-to-18-gwh-annually/ · https://www.electrive.com/2026/06/22/lyten-to-pay-e60-million-for-northvolt-site-in-heide/ · https://www.electrive.com/2026/03/18/germany-lyten-to-launch-battery-production-at-former-northvolt-site-in-heide-by-2028/ · https://www.basf.com/global/en/media/news-releases/2025/06/p-25-112 · https://www.electrive.com/2026/07/21/cylib-acquires-bavarian-ev-battery-recycling-facility/ · https://www.cleanthinking.de/?p=1041985 · https://www.electrive.com/2025/08/11/glencore-is-taking-over-li-cycle/

## 9. Caveats

1. MEB cell-supplier-per-pack and BMW Gen5 module counts rest on third-party sources; official numbers exist only for modules and cells per module (VW, Audi, Porsche, Mercedes EQS).
2. Cell-to-pack designs (PowerCo unified cell, BMW Gen6, Mercedes MB.EA-L) have no removable modules.
3. Several items are plans, not production: SSP, Tesla Grünheide cells (2027), Lyten Heide (2028), Mercedes MB.EA-L cylindrical cells (2028), Samsung SDI for Mercedes (2028), Cylib Dormagen (2027).
4. Our demo manufacturers, cell models and packs (Altmark Cells, Lithosa Zellwerk, Nordzell Energie, Rhein Phosphat Zellen, Baltic Natrium, Elbe Akku; Voltaro VX-33/VX-60/VX-80/CX-30/CX-40/CX-48/CX-55/RX-90) are invented and must not be presented as real products. The sodium-ion and LMFP packs are forward-looking: no German brand sells such a car today (section 5).
5. Article 77(7)/(8) and Annex VII wording comes from secondary reproductions; EUR-Lex blocked automated access. Open https://eur-lex.europa.eu/eli/reg/2023/1542/oj and confirm before quoting.
6. No accessible standard contains a literal "do not mix cell types" clause; the argument rests on per-cell-type test bases (UL 9540A, UN 38.3), IEC 63330-1's traceability requirement, GB/T 34015.3's same-model grouping and Battery University guidance.
7. Matching tolerances (±2–5 % capacity, about ±10 % resistance) are practice figures, not normative values.
