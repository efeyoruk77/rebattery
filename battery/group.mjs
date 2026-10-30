// Deterministic grouping of tested modules into new batteries.
// Rules: same cell model and chemistry; capacity and resistance within bands of the group average;
// clean history (no accident, no open warning, traceable donor). Uses signed test values only.
import { groupingRules as defaults } from './config.mjs';

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const packOf = (moduleId) => moduleId.split('-M')[0];
const byModuleId = (a, b) => a.module_id.localeCompare(b.module_id, 'en', { numeric: true });

// Why a module must be held back before band checks, from events and warnings. Returns Map<module_id, reasons[]>.
function historyHolds(tests, events, warnings) {
  const holds = new Map();
  const add = (id, reason) => holds.set(id, [...(holds.get(id) ?? []), reason]);
  const modulesOfPack = (pack) => tests.filter((t) => packOf(t.module_id) === pack).map((t) => t.module_id);
  const eventsById = new Map(events.map((e) => [e.event_id, e]));
  const donorPacks = new Set(events.map((e) => e.pack_id));

  for (const t of tests) {
    if (!donorPacks.has(packOf(t.module_id))) add(t.module_id, `no traceable donor: no verified events for pack ${packOf(t.module_id)}`);
  }
  // An accident names its module, or (module_id null) puts the whole pack in doubt.
  for (const a of events.filter((e) => e.type === 'accident')) {
    for (const id of a.module_id ? [a.module_id] : modulesOfPack(a.pack_id)) add(id, `accident event ${a.event_id}`);
  }
  // A warning holds back the modules its events name; if none names a module, the whole pack.
  for (const w of warnings) {
    const linked = w.events.map((id) => eventsById.get(id)).filter(Boolean);
    const named = [...new Set(linked.map((e) => e.module_id).filter(Boolean))];
    const ids = named.length ? named : [...new Set(linked.map((e) => e.pack_id))].flatMap(modulesOfPack);
    for (const id of ids) add(id, `open warning ${w.rule} (${w.events.join(', ')})`);
  }
  return holds;
}

const deviationPct = (value, avg) => ((value - avg) / avg) * 100;

// Removes the worst band violator one at a time until every remaining module fits. Ties break by module_id.
function fitBands(candidates, rules) {
  let group = [...candidates];
  for (;;) {
    if (!group.length) return group;
    const cap = mean(group.map((t) => t.capacity_ah));
    const res = mean(group.map((t) => t.internal_resistance_mohm));
    const score = (t) => Math.max(
      Math.abs(deviationPct(t.capacity_ah, cap)) / rules.capacity_band_pct,
      Math.abs(deviationPct(t.internal_resistance_mohm, res)) / rules.resistance_band_pct,
    );
    const worst = group.reduce((w, t) => (score(t) > score(w) ? t : w));
    if (score(worst) <= 1) return group;
    group = group.filter((t) => t !== worst);
  }
}

// Plain reasons for a module that does not fit the bands of the final group.
function bandReasons(t, group, rules) {
  if (!group.length) return [];
  const cap = mean(group.map((g) => g.capacity_ah));
  const res = mean(group.map((g) => g.internal_resistance_mohm));
  const reasons = [];
  const dc = deviationPct(t.capacity_ah, cap);
  const dr = deviationPct(t.internal_resistance_mohm, res);
  if (Math.abs(dc) > rules.capacity_band_pct) {
    reasons.push(`capacity ${t.capacity_ah} Ah is ${round(Math.abs(dc))}% ${dc > 0 ? 'above' : 'below'} the group average ${round(cap, 2)} Ah (band ±${rules.capacity_band_pct}%)`);
  }
  if (Math.abs(dr) > rules.resistance_band_pct) {
    reasons.push(`resistance ${t.internal_resistance_mohm} mΩ is ${round(Math.abs(dr))}% ${dr > 0 ? 'above' : 'below'} the group average ${round(res, 3)} mΩ (band ±${rules.resistance_band_pct}%)`);
  }
  return reasons;
}

// group(moduleTests, events, warnings) -> newBatteries
// moduleTests must already have passed checkModuleTests. One entry per cell model + chemistry.
// An entry with battery_id null means too few modules matched; all its modules are held back.
export function group(moduleTests, events, warnings, rules = defaults) {
  const holds = historyHolds(moduleTests, events, warnings);
  const families = new Map();
  for (const t of [...moduleTests].sort(byModuleId)) {
    const key = `${t.cell_model}|${t.chemistry}`;
    families.set(key, [...(families.get(key) ?? []), t]);
  }

  let next = 1;
  return [...families.keys()].sort().map((key) => {
    const tests = families.get(key);
    const clean = tests.filter((t) => !holds.has(t.module_id));
    let members = fitBands(clean, rules);
    const tooFew = members.length < rules.min_modules;
    if (tooFew) members = [];

    const held_back = tests.filter((t) => !members.includes(t)).map((t) => {
      const reasons = [...(holds.get(t.module_id) ?? []), ...bandReasons(t, members, rules)];
      if (tooFew) reasons.push(`only ${fitBands(clean, rules).length} modules match; a battery needs at least ${rules.min_modules}`);
      return { module_id: t.module_id, reason: reasons.join('; ') };
    });

    return {
      battery_id: tooFew ? null : `NB-${next++}`,
      cell_model: tests[0].cell_model,
      chemistry: tests[0].chemistry,
      rules: { ...rules },
      modules: members.map((t) => ({ module_id: t.module_id, donor_pack: packOf(t.module_id) })),
      held_back,
    };
  });
}
