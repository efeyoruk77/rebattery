// Rule-based inconsistency checks over verified events. Each rule returns warnings in the shared format:
// { type: 'inconsistency', rule, events: [event_id...], message }
import { inconsistencyRules as defaults } from './config.mjs';

const byDate = (a, b) => a.date.localeCompare(b.date) || a.event_id.localeCompare(b.event_id);
const monthsBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / (1000 * 60 * 60 * 24 * 30.4375);
const soh = (e) => (typeof e.fields?.soh_pct === 'number' ? e.fields.soh_pct : null);
const isRepair = (e) => e.type === 'module_replacement' || e.type === 'cell_replacement';
const warn = (rule, events, message) => ({ type: 'inconsistency', rule, events: events.map((e) => e.event_id), message });

// A high pack-level health value soon after a module replacement: a single pack value
// cannot describe a pack that now mixes old modules with a new one.
function sohAfterReplacement(events, rules) {
  const { min_soh_pct, window_months } = rules.soh_after_replacement;
  const out = [];
  for (const repl of events.filter((e) => e.type === 'module_replacement')) {
    for (const m of events.filter((e) => e.type === 'soh_measurement' && soh(e) !== null)) {
      const months = monthsBetween(repl.date, m.date);
      if (months >= 0 && months <= window_months && soh(m) >= min_soh_pct) {
        out.push(warn('soh_after_replacement', [repl, m],
          `Health of ${soh(m)}% reported ${Math.round(months)} months after ${repl.module_id ?? 'a module'} was replaced; ` +
          'one pack-level value is inconsistent with a pack that mixes old and new modules.'));
      }
    }
  }
  return out;
}

// Dates out of order: anything dated before production, registration before production, or dates in the future.
function datesOutOfOrder(events, rules, today) {
  const out = [];
  const production = events.find((e) => e.type === 'production');
  if (production) {
    for (const e of events.filter((x) => x !== production && x.date < production.date)) {
      out.push(warn('dates_out_of_order', [production, e], `${e.type} on ${e.date} is dated before production on ${production.date}.`));
    }
  }
  for (const e of events.filter((x) => x.date > today)) {
    out.push(warn('dates_out_of_order', [e], `${e.type} is dated ${e.date}, which is in the future.`));
  }
  return out;
}

// Health rising between two measurements with no module or cell replacement in between.
function healthRisingWithoutRepair(events, rules) {
  const out = [];
  const measured = events.filter((e) => e.type === 'soh_measurement' && soh(e) !== null);
  for (let i = 1; i < measured.length; i++) {
    const [before, after] = [measured[i - 1], measured[i]];
    const repaired = events.some((e) => isRepair(e) && e.date >= before.date && e.date <= after.date);
    if (!repaired && soh(after) - soh(before) > rules.health_rise_tolerance_pct) {
      out.push(warn('health_rising_without_repair', [before, after],
        `Health rose from ${soh(before)}% (${before.date}) to ${soh(after)}% (${after.date}) with no recorded repair in between.`));
    }
  }
  return out;
}

// An accident with no later health measurement.
function accidentWithoutInspection(events) {
  return events.filter((e) => e.type === 'accident')
    .filter((a) => !events.some((e) => e.type === 'soh_measurement' && e.date > a.date))
    .map((a) => warn('accident_without_inspection', [a],
      `Accident on ${a.date}${a.module_id ? ` affecting ${a.module_id}` : ''} has no later health measurement.`));
}

export function findInconsistencies(events, { rules = defaults, today = new Date().toISOString().slice(0, 10) } = {}) {
  const packs = [...new Set(events.map((e) => e.pack_id))].sort();
  const warnings = [];
  for (const pack of packs) {
    const packEvents = events.filter((e) => e.pack_id === pack).sort(byDate);
    warnings.push(
      ...sohAfterReplacement(packEvents, rules),
      ...datesOutOfOrder(packEvents, rules, today),
      ...healthRisingWithoutRepair(packEvents, rules),
      ...accidentWithoutInspection(packEvents),
    );
  }
  return warnings;
}
