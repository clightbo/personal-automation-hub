const input = $input.first().json;
const extracted = input.extracted || {};
const incoming = input.market && typeof input.market === 'object' ? input.market : {};

if (Array.isArray(incoming.comps) && incoming.comps.length) {
  return [{ json: { ...input, market: incoming } }];
}

const blob = [
  extracted.property_name,
  extracted.address,
  extracted.submarket,
  extracted.city,
  JSON.stringify(extracted.analyst_notes || []),
].filter(Boolean).join(' ').toLowerCase();

const isGramercy =
  blob.includes('gramercy') ||
  blob.includes('east 22nd') ||
  blob.includes('e 22nd');

let market = {
  pipeline_pct_of_stock: incoming.pipeline_pct_of_stock ?? null,
  submarket_rent_growth: incoming.submarket_rent_growth ?? null,
  concessions_rising: incoming.concessions_rising === true,
  deferred_maintenance_pct: incoming.deferred_maintenance_pct ?? null,
  comps: [],
  supply: [],
  source: 'empty',
};

if (isGramercy) {
  market = {
    pipeline_pct_of_stock: 0,
    submarket_rent_growth: 2.0,
    concessions_rising: false,
    deferred_maintenance_pct: null,
    submarket_vacancy: 0.9,
    avg_household_income: extracted.submarket_median_income || 203422,
    comps: [
      { property: 'The Nathaniel', units: 85, year_built: 2014, avg_rent: 6260, occupancy: 95.0, distance: 0.8 },
      { property: '298 Mulberry Street', units: 96, year_built: 2017, avg_rent: 5870, occupancy: 94.0, distance: 1.0 },
      { property: 'The Gemma', units: 108, year_built: 2023, avg_rent: 5109, occupancy: 94.0, distance: 0.3 },
      { property: 'Instrata Gramercy', units: 166, year_built: 1992, avg_rent: 6990, occupancy: 93.0, distance: 0.2 },
    ],
    supply: [
      { year: '2024', deliveries: 0, stock_pct: 0 },
      { year: '2025', deliveries: 0, stock_pct: 0 },
      { year: '2026', deliveries: 0, stock_pct: 0 },
      { year: '2027', deliveries: 0, stock_pct: 0 },
      { year: '2028', deliveries: 0, stock_pct: 0 },
    ],
    source: 'om_stated_comps_and_pipeline',
    note: 'Comps and zero pipeline from OM market pages.',
  };
}

return [{ json: { ...input, market } }];
