// All rule values for verification and grouping live here.
// They are demo placeholders; real limits depend on the cell model and the new ESS design.
export const groupingRules = {
  capacity_band_pct: 2,      // each cell within ±2% of its ESS's average capacity
  resistance_band_pct: 10,   // each cell within ±10% of its ESS's average internal resistance
  cells_per_ess: 48,         // cells in series per new ESS (48 × 3.7 V × 66 Ah ≈ 11.7 kWh home storage)
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
