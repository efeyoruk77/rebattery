// Deterministic grouping in two steps, using signed test values only (never estimated fields).
// 1. screenModules: a module with an accident, an open warning, or no traceable donor is held back.
//    Every other tested module is cleared to be taken apart into cells.
// 2. groupCells: cells of cleared modules with the same cell model and chemistry, and with capacity and
//    resistance within set bands, are combined into new ESS units of a fixed size.
import { groupingRules as defaults } from './config.mjs';

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (value, ref) => ((value - ref) / ref) * 100;
const packOf = (moduleId) => moduleId.split('-M')[0];
const byId = (key) => (a, b) => a[key].localeCompare(b[key], 'en', { numeric: true });

// ---- Step 1: modules ----

// screenModules(moduleTests, events, warnings) -> { cleared: moduleTests, held_back: [{ id, level, reason }], held_cells }
// held_cells: cells that an accident or open warning names directly. Their module is still taken apart,
// but those cells are never grouped. An event that names neither modules nor cells puts the whole pack in doubt.
export function screenModules(moduleTests, events, warnings) {
  const holds = new Map();
  const cellHolds = new Map();
  const add = (id, reason) => holds.set(id, [...(holds.get(id) ?? []), reason]);
  const addCell = (id, reason) => cellHolds.set(id, [...(cellHolds.get(id) ?? []), reason]);
  const modulesOfPack = (pack) => moduleTests.filter((t) => packOf(t.module_id) === pack).map((t) => t.module_id);
  const eventsById = new Map(events.map((e) => [e.event_id, e]));
  const donorPacks = new Set(events.map((e) => e.pack_id));

  for (const t of moduleTests) {
    if (!donorPacks.has(packOf(t.module_id))) add(t.module_id, `no traceable donor: no verified events for pack ${packOf(t.module_id)}`);
  }
  // Hold back what the events name: their modules, their cells, or (naming neither) every module of their packs.
  const holdNamed = (linked, reason) => {
    const modules = [...new Set(linked.flatMap((e) => e.module_ids ?? []))];
    const cells = [...new Set(linked.flatMap((e) => e.cell_ids ?? []))];
    for (const id of modules) add(id, reason);
    for (const id of cells) addCell(id, reason);
    if (!modules.length && !cells.length) for (const id of [...new Set(linked.map((e) => e.pack_id))].flatMap(modulesOfPack)) add(id, reason);
  };
  for (const a of events.filter((e) => e.type === 'accident')) holdNamed([a], `accident event ${a.event_id}`);
  for (const w of warnings) {
    holdNamed(w.events.map((id) => eventsById.get(id)).filter(Boolean), `open warning ${w.rule} (${w.events.join(', ')})`);
  }

  const sorted = [...moduleTests].sort(byId('module_id'));
  return {
    cleared: sorted.filter((t) => !holds.has(t.module_id)),
    held_back: sorted.filter((t) => holds.has(t.module_id))
      .map((t) => ({ id: t.module_id, level: 'module', reason: `${holds.get(t.module_id).join('; ')}; not taken apart` })),
    // A cell inside a held-back module is already covered by its module.
    held_cells: [...cellHolds.keys()].filter((id) => !holds.has(id.replace(/-C\d+$/, ''))).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map((id) => ({ id, level: 'cell', reason: `${cellHolds.get(id).join('; ')}; not used` })),
  };
}

// ---- Step 2: cells ----

// A cell family is one cell model of one chemistry. Cells of two families are never put into one ESS:
// different chemistries have different voltage windows, and different models have different capacity,
// resistance, format and ageing (see docs/battery-info.md). This is enforced twice: cells are grouped
// family by family, and every finished unit is checked again before it leaves this module.
export const cellFamily = (c) => (c.cell_model && c.chemistry ? `${c.cell_model}|${c.chemistry}` : null);
export const sameFamily = (a, b) => cellFamily(a) !== null && cellFamily(a) === cellFamily(b);
export function assertOneFamily(unit, label = 'ESS') {
  const fams = new Set(unit.map(cellFamily));
  if (fams.size !== 1 || fams.has(null)) {
    throw new Error(`${label} would mix cell families [${[...fams].map((f) => f ?? 'unknown').join(', ')}]; cells of different chemistries or cell models are never combined`);
  }
}

function fits(cells, rules, { ignoreResistance = false } = {}) {
  const cap = mean(cells.map((c) => c.capacity_ah));
  const res = mean(cells.map((c) => c.internal_resistance_mohm));
  return cells.every((c) => Math.abs(pct(c.capacity_ah, cap)) <= rules.capacity_band_pct
    && (ignoreResistance || Math.abs(pct(c.internal_resistance_mohm, res)) <= rules.resistance_band_pct));
}

// What a QR code on the new ESS shows about its second-life health and where it was made.
// Cells are in series, so usable capacity is set by the weakest cell.
function essHealth(cells) {
  const caps = cells.map((c) => c.capacity_ah);
  const nominal = cells[0].nominal_capacity_ah;
  const facilities = [...new Map(cells.map((c) => [c.facility.id, c.facility])).values()];
  return {
    health: {
      cell_count: cells.length,
      usable_capacity_ah: Math.min(...caps),
      nominal_capacity_ah: nominal,
      soh_pct: round((Math.min(...caps) / nominal) * 100),
      avg_cell_capacity_ah: round(mean(caps), 2),
      avg_cell_resistance_mohm: round(mean(cells.map((c) => c.internal_resistance_mohm)), 3),
      cells_tested_on: [...new Set(cells.map((c) => c.tested_on))].sort(),
      basis: 'signed cell test results',
    },
    second_life_facility: facilities.length === 1 ? facilities[0] : facilities,
  };
}

// groupCells(cells, rules) -> { new_batteries, held_back }
// Cells are sorted by capacity and filled into ESS units in that order, so each unit holds neighbouring cells.
export function groupCells(cells, rules = defaults) {
  const families = new Map();
  const new_batteries = [];
  const held_back = [];
  const hold = (c, reason) => held_back.push({ id: c.cell_id, level: 'cell', reason });
  for (const c of [...cells].sort(byId('cell_id'))) {
    const key = cellFamily(c);
    // A cell whose model or chemistry is unknown belongs to no family and is never grouped.
    if (!key) { hold(c, 'cell model or chemistry not recorded in the signed test; cannot be assigned to a cell family'); continue; }
    families.set(key, [...(families.get(key) ?? []), c]);
  }

  for (const key of [...families.keys()].sort()) {
    const family = families.get(key);
    // Resistance outliers first, against the family median, so one bad cell cannot start or break a unit.
    const medRes = median(family.map((c) => c.internal_resistance_mohm));
    const usable = [];
    for (const c of family) {
      const d = pct(c.internal_resistance_mohm, medRes);
      if (Math.abs(d) > rules.resistance_band_pct) {
        hold(c, `resistance ${c.internal_resistance_mohm} mΩ is ${round(Math.abs(d))}% ${d > 0 ? 'above' : 'below'} the median ${round(medRes, 3)} mΩ of ${c.cell_model} cells (band ±${rules.resistance_band_pct}%)`);
      } else usable.push(c);
    }
    usable.sort((a, b) => a.capacity_ah - b.capacity_ah || a.internal_resistance_mohm - b.internal_resistance_mohm || byId('cell_id')(a, b));

    let current = [];
    const flush = () => {
      if (!current.length) return;
      const lo = current[0].capacity_ah;
      const hi = current.at(-1).capacity_ah;
      for (const c of current) {
        hold(c, current.length === 1
          ? `capacity ${c.capacity_ah} Ah matches no neighbouring cell within ±${rules.capacity_band_pct}%`
          : `left over: only ${current.length} matching cells remain between ${lo} and ${hi} Ah; an ESS needs ${rules.cells_per_ess}`);
      }
      current = [];
    };
    for (const c of usable) {
      if (fits([...current, c], rules)) current.push(c);
      else if (fits([...current, c], rules, { ignoreResistance: true })) {
        hold(c, `resistance ${c.internal_resistance_mohm} mΩ does not match the cells around ${c.capacity_ah} Ah (band ±${rules.resistance_band_pct}%)`);
        continue;
      } else { flush(); current = [c]; }
      if (current.length === rules.cells_per_ess) {
        const unit = [...current].sort(byId('cell_id'));
        assertOneFamily(unit, `ESS-${new_batteries.length + 1}`);
        new_batteries.push({
          battery_id: `ESS-${new_batteries.length + 1}`,
          cell_model: c.cell_model,
          chemistry: c.chemistry,
          rules: { ...rules },
          cells: unit.map((x) => ({ cell_id: x.cell_id, module_id: x.module_id, donor_pack: packOf(x.module_id) })),
          donor_packs: [...new Set(unit.map((x) => packOf(x.module_id)))].sort(),
          ...essHealth(unit),
        });
        current = [];
      }
    }
    flush();
  }
  return { new_batteries, held_back: held_back.sort(byId('id')) };
}

// group(moduleTests, cellTests, events, warnings) -> { new_batteries, held_back }
// moduleTests must have passed checkModuleTests; cellTests (flat cells) must have passed checkCellTests
// against the cleared modules. Pass screenModules' result via `screened` to avoid screening twice.
export function group(moduleTests, cells, events, warnings, rules = defaults, screened = screenModules(moduleTests, events, warnings)) {
  const cleared = new Set(screened.cleared.map((m) => m.module_id));
  const heldCells = screened.held_cells ?? [];
  const named = new Set(heldCells.map((h) => h.id));
  const grouped = groupCells(cells.filter((c) => cleared.has(c.module_id) && !named.has(c.cell_id)), rules);
  // A cleared module without a valid cell test batch has no cells to group. Name it, so every module is accounted for.
  const tested = new Set(cells.map((c) => c.module_id));
  const untested = [...cleared].filter((m) => !tested.has(m)).sort()
    .map((id) => ({ id, level: 'module', reason: 'cleared, but no valid cell test batch; cells not used' }));
  // Final check on what leaves this module: one cell family per ESS, and the family the unit claims is the one its cells have.
  const byCellId = new Map(cells.map((c) => [c.cell_id, c]));
  for (const b of grouped.new_batteries) {
    const unitCells = b.cells.map((x) => byCellId.get(x.cell_id));
    assertOneFamily([...unitCells, { cell_model: b.cell_model, chemistry: b.chemistry }], b.battery_id);
  }
  return { new_batteries: grouped.new_batteries, held_back: [...screened.held_back, ...untested, ...heldCells, ...grouped.held_back] };
}
