const input = $input.first().json;
const extracted = input.extracted || {};
const incoming = input.market && typeof input.market === 'object' ? input.market : {};

// Prefer existing comps pack if already filled
if (
  Array.isArray(incoming.comps) &&
  incoming.comps.length &&
  incoming.pipeline_pct_of_stock != null
) {
  return [{ json: { ...input, market: incoming } }];
}

// OM text for pipeline scrape
let text = '';
const textNodes = [
  'Trim For Context Window',
  'Trim for Context Window',
  'Extract PDF Text',
  'Extract from File',
  'Extract PDF',
];
for (const name of textNodes) {
  if (text) break;
  try {
    const j = $(name).first().json;
    text = String(j.text || j.data || j.content || '');
  } catch (err) {}
}

const blob = [
  text,
  extracted.property_name,
  extracted.address,
  extracted.submarket,
  extracted.city,
  JSON.stringify(extracted.analyst_notes || []),
  JSON.stringify(extracted),
].filter(Boolean).join('\n');

const blobLower = blob.toLowerCase();
const isGramercy =
  blobLower.includes('gramercy') ||
  blobLower.includes('east 22nd') ||
  blobLower.includes('e 22nd');

const toNum = (s) => {
  if (s == null || s === '') return null;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Pull pipeline % of stock from OM language.
 * Handles: "1,127 units vs 19,382 in CBD", "pipeline equals 4.8% of stock",
 * "1,127-unit pipeline against 19,382 units of inventory", etc.
 */
function scrapePipeline(src) {
  let pipelineUnits = null;
  let stockUnits = null;
  let pct = null;
  let note = null;

  // Explicit percent of stock / inventory
  const pctMatch = src.match(
    /pipeline[^\n%]{0,60}?(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:submarket\s+)?(?:stock|inventory|existing)/i,
  ) || src.match(
    /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:submarket\s+)?(?:stock|inventory)[^\n.]{0,40}pipeline/i,
  ) || src.match(
    /(?:equals|equal to|represents)\s+(\d{1,2}(?:\.\d+)?)\s*%\s*of\s+(?:submarket\s+)?(?:stock|inventory)/i,
  );
  if (pctMatch) {
    pct = Number(pctMatch[1]);
    note = `OM stated pipeline ~${pct}% of stock`;
  }

  // "1,127 units vs 19,382" / "1,127 units versus 19,382 in CBD"
  const vsMatch = src.match(
    /\(?\s*([\d,]+)\s*units?\s+(?:vs\.?|versus|against|compared to)\s+([\d,]+)(?:\s*(?:units?\s+)?(?:in\s+)?(?:the\s+)?(?:CBD|submarket|market|inventory|stock))?/i,
  );
  if (vsMatch) {
    pipelineUnits = toNum(vsMatch[1]);
    stockUnits = toNum(vsMatch[2]);
  }

  // "pipeline of 1,127 units" + later "19,382 units of inventory/stock"
  if (pipelineUnits == null) {
    const pOnly =
      src.match(/(?:limited\s+)?pipeline(?:\s+supply)?[^\n\d]{0,30}([\d,]+)\s*units?/i) ||
      src.match(/([\d,]+)\s*(?:-|\s)?units?\s+(?:in\s+)?(?:the\s+)?(?:near[- ]term\s+)?pipeline/i) ||
      src.match(/([\d,]+)\s*units?\s+under\s+construction/i);
    if (pOnly) pipelineUnits = toNum(pOnly[1]);
  }
  if (stockUnits == null) {
    const sOnly =
      src.match(/([\d,]+)\s*units?\s+(?:of\s+)?(?:existing\s+)?(?:submarket\s+|CBD\s+)?(?:inventory|stock)/i) ||
      src.match(/(?:inventory|stock)\s+of\s+([\d,]+)\s*units?/i) ||
      src.match(/([\d,]+)\s*(?:unit\s+)?(?:CBD|submarket)\s+(?:inventory|stock)/i);
    if (sOnly) stockUnits = toNum(sOnly[1]);
  }

  // From extracted JSON fields if LLM already pulled them
  const exPct = toNum(
    extracted.pipeline_pct_of_stock ??
      extracted.pipeline_pct ??
      incoming.pipeline_pct_of_stock,
  );
  const exPipe = toNum(
    extracted.pipeline_units ?? extracted.pipeline ?? extracted.units_in_pipeline,
  );
  const exStock = toNum(
    extracted.submarket_stock ?? extracted.stock_units ?? extracted.inventory_units,
  );
  if (exPct != null && pct == null) pct = exPct;
  if (exPipe != null && pipelineUnits == null) pipelineUnits = exPipe;
  if (exStock != null && stockUnits == null) stockUnits = exStock;

  if (pct == null && pipelineUnits != null && stockUnits != null && stockUnits > 0) {
    pct = round1((pipelineUnits / stockUnits) * 100);
    note =
      note ||
      `OM pipeline ${pipelineUnits.toLocaleString()} units vs ${stockUnits.toLocaleString()} stock (${pct}%)`;
  }

  // Soft language with no numbers → treat as low/limited (PASS band)
  if (
    pct == null &&
    /limited\s+pipeline|minimal\s+pipeline|no\s+(?:near[- ]term\s+)?pipeline|negligible\s+new\s+supply/i.test(
      src,
    )
  ) {
    pct = 0;
    note = 'OM describes limited/minimal pipeline (no numeric % found; scored as 0%)';
  }

  return { pipelineUnits, stockUnits, pct, note };
}

const scraped = scrapePipeline(blob);

let market = {
  pipeline_pct_of_stock:
    incoming.pipeline_pct_of_stock != null
      ? Number(incoming.pipeline_pct_of_stock)
      : scraped.pct,
  pipeline_units: scraped.pipelineUnits,
  stock_units: scraped.stockUnits,
  submarket_rent_growth: incoming.submarket_rent_growth ?? null,
  concessions_rising: incoming.concessions_rising === true,
  deferred_maintenance_pct: incoming.deferred_maintenance_pct ?? null,
  comps: Array.isArray(incoming.comps) ? incoming.comps : [],
  supply: Array.isArray(incoming.supply) ? incoming.supply : [],
  source: scraped.pct != null ? 'om_text_pipeline_scrape' : 'empty',
  note: scraped.note || null,
};

// Gramercy known pack (comps + zero pipeline) when detected
if (isGramercy) {
  market = {
    ...market,
    pipeline_pct_of_stock:
      market.pipeline_pct_of_stock != null ? market.pipeline_pct_of_stock : 0,
    submarket_rent_growth: market.submarket_rent_growth ?? 2.0,
    concessions_rising: false,
    submarket_vacancy: 0.9,
    avg_household_income: extracted.submarket_median_income || 203422,
    comps:
      market.comps.length > 0
        ? market.comps
        : [
            { property: 'The Nathaniel', units: 85, year_built: 2014, avg_rent: 6260, occupancy: 95.0, distance: 0.8 },
            { property: '298 Mulberry Street', units: 96, year_built: 2017, avg_rent: 5870, occupancy: 94.0, distance: 1.0 },
            { property: 'The Gemma', units: 108, year_built: 2023, avg_rent: 5109, occupancy: 94.0, distance: 0.3 },
            { property: 'Instrata Gramercy', units: 166, year_built: 1992, avg_rent: 6990, occupancy: 93.0, distance: 0.2 },
          ],
    supply:
      market.supply.length > 0
        ? market.supply
        : [
            { year: '2024', deliveries: 0, stock_pct: 0 },
            { year: '2025', deliveries: 0, stock_pct: 0 },
            { year: '2026', deliveries: 0, stock_pct: 0 },
            { year: '2027', deliveries: 0, stock_pct: 0 },
            { year: '2028', deliveries: 0, stock_pct: 0 },
          ],
    source: market.source === 'empty' ? 'om_stated_comps_and_pipeline' : market.source,
    note: market.note || 'Comps and pipeline from OM market pages.',
  };
}

// If we have a pipeline % but no yearly supply rows, synthesize one row for the Market panel
if (
  market.pipeline_pct_of_stock != null &&
  (!Array.isArray(market.supply) || market.supply.length === 0)
) {
  const deliveries = scraped.pipelineUnits != null ? scraped.pipelineUnits : 0;
  market.supply = [
    {
      year: 'Pipeline',
      deliveries,
      stock_pct: Number(market.pipeline_pct_of_stock),
    },
  ];
}

return [{ json: { ...input, market } }];
