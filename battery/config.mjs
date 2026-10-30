// All rule values for verification and grouping live here.
// They are demo placeholders; real limits depend on the cell model and the new battery's design.
export const groupingRules = {
  capacity_band_pct: 3,      // each module within ±3% of the group's average capacity
  resistance_band_pct: 10,   // each module within ±10% of the group's average internal resistance
  min_modules: 4,            // fewer matching modules than this do not form a battery
};

export const inconsistencyRules = {
  // A pack-level health value this high, this soon after a module replacement, is flagged.
  soh_after_replacement: { min_soh_pct: 90, window_months: 18 },
  // A later health value this many points higher than an earlier one, with no repair between, is flagged.
  health_rise_tolerance_pct: 1,
};

export const eventTypes = [
  'production', 'first_registration', 'module_replacement', 'cell_replacement', 'software_update',
  'fault', 'soh_measurement', 'accident', 'charging_profile', 'warranty_claim', 'remaining_capacity_estimate',
];

export const confidenceLevels = ['signed', 'documented', 'estimated'];
