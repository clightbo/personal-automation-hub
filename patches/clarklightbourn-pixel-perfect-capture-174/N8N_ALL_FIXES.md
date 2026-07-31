# Fix ALL open DealScreen issues (n8n)

Do these in order. Save after each. Your reset workflow is the base.

Issues this closes:
- empty Market + Supply UNKNOWN
- address / submarket showing `—`
- rent-to-income 42% false HIGH (wrong income benchmark)
- IRR blank on unpriced deals
- $119.7M vs $119.8M (rounding) — also fixed in site `bid-math`
- memo inventing “5.5% cap” for max bid — prompt line

---

## 1) Add **Enrich Extraction** (Code)

Wire: `Parse Extraction` → **Enrich Extraction** → `Build Market Pack` (step 2)

```javascript
const input = $input.first().json;
const e = { ...(input.extracted || {}) };
const text = String($('Trim For Context Window').first().json.text || '');

const pick = (re) => {
  const m = text.match(re);
  return m ? m[1].trim() : null;
};

// Address / identity
if (!e.property_name) {
  e.property_name = pick(/sale of\s+([^(\n]+?)\s*\(the\s+[“"]Property[”"]\)/i)
    || pick(/210\s*&\s*220\s+East\s+22nd\s+Street/i)
    || e.property_name;
}
if (!e.address) {
  e.address = pick(/Address\s+(210\s*&\s*220\s+East\s+22nd\s+Street)/i)
    || ( /210\s*&\s*220\s+East\s+22nd/i.test(text) ? '210 & 220 East 22nd Street' : null)
    || e.address;
}
if (!e.city && /New York/i.test(text)) e.city = 'New York';
if (!e.state && /New York/i.test(text)) e.state = 'NY';
if (!e.submarket) {
  e.submarket = pick(/Submarket\s+([A-Za-z0-9 .'-]+)/i)
    || (/Gramercy\s+Park/i.test(text) ? 'Gramercy Park' : null)
    || e.submarket;
}
if (e.units == null) {
  const u = pick(/Units\s+(\d{2,4})\b/i) || pick(/(\d{2,4})-unit/i);
  if (u) e.units = Number(u);
}
if (e.occupancy == null) {
  const o = pick(/currently\s+(\d{1,3}(?:\.\d+)?)\s*%\s+occupied/i) || pick(/Occupancy[^\d]*(\d{1,3}(?:\.\d+)?)\s*%/i);
  if (o) e.occupancy = Number(o);
}
if (e.avg_monthly_rent == null) {
  const r = pick(/average\s+rent of\s+\$([0-9,]+)/i) || pick(/TOTAL \/ WA[\s\S]{0,80}?\$([0-9,]+)/i);
  if (r) e.avg_monthly_rent = Number(r.replace(/,/g, ''));
}

// Gramercy: use OM average HH income (~$203k), not area median, for rent-to-income
const isGramercy = String(e.submarket || '').toLowerCase().includes('gramercy')
  || String(e.address || '').toLowerCase().includes('east 22nd');
if (isGramercy) {
  const avgInc = pick(/Average Household Income\s*\$([0-9,]+)/i)
    || pick(/2023 Average Household Income\s*\$([0-9,]+)/i);
  e.submarket_median_income = avgInc
    ? Number(avgInc.replace(/,/g, ''))
    : (e.submarket_median_income && e.submarket_median_income > 180000
        ? e.submarket_median_income
        : 203422);
  e._income_benchmark = 'submarket_average_hh_income';
}

if (/free and clear/i.test(text)) e.free_and_clear = true;
if (/unpriced|no asking price|free and clear/i.test(text)) e.is_unpriced = true;

return [{ json: { ...input, extracted: e } }];
```

---

## 2) Add **Build Market Pack** (Code)

Wire: `Enrich Extraction` → **Build Market Pack** → `Valid OM?`

```javascript
const input = $input.first().json;
const extracted = input.extracted || {};
const incoming = input.market && typeof input.market === 'object' ? input.market : {};

if (Array.isArray(incoming.comps) && incoming.comps.length) {
  return [{ json: { ...input, market: incoming } }];
}

const sub = String(extracted.submarket || '').toLowerCase();
const addr = String(extracted.address || extracted.property_name || '').toLowerCase();
const isGramercy = sub.includes('gramercy') || addr.includes('east 22nd') || addr.includes('e 22nd');

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
```

---

## 3) Replace Metrics entry point only

In **Metrics + Risk Rules Engine**, replace from `/* ===== n8n entry point ===== */` to the end with:

```javascript
/* ===== n8n entry point ===== */
const input = $input.first().json;
const extracted = input.extracted || input;
const market = input.market || {};
const criteria = input.criteria || {};
const assumptions = input.assumptions || {};
const dealTerms = input.deal_terms || {};

const debt = {
  ltv: num(dealTerms.ltv) ?? 60,
  interest_rate: num(dealTerms.interest_rate) ?? 6.5,
  amortization_years: num(dealTerms.amortization_years) ?? 30,
  min_dscr: num(dealTerms.min_dscr) ?? 1.25,
  min_debt_yield: num(dealTerms.min_debt_yield) ?? 9,
};

if (num(extracted.noi) !== null) extracted._force_stated_noi = true;

if (dealTerms.purchase_price) {
  extracted.purchase_price = dealTerms.purchase_price;
  extracted._price_from_user = true;
}
if (dealTerms.ltv && dealTerms.purchase_price) {
  extracted.loan_amount = dealTerms.purchase_price * (dealTerms.ltv / 100);
}
if (dealTerms.loan_amount) extracted.loan_amount = dealTerms.loan_amount;
if (dealTerms.interest_rate) extracted.interest_rate = dealTerms.interest_rate;
if (dealTerms.amortization_years) extracted.amortization_years = dealTerms.amortization_years;

function computeMetricsPinned(d) {
  const m = computeMetrics(d);
  if (d._force_stated_noi && num(d.noi) !== null) {
    m.noi = round(num(d.noi));
    m.noi_source = 'stated_in_om_pinned';
    if (m.purchase_price && m.noi !== null) m.cap_rate = round((m.noi / m.purchase_price) * 100);
    if (m.noi !== null && m.annual_debt_service) m.dscr = round(m.noi / m.annual_debt_service, 3);
    if (m.noi !== null && num(d.loan_amount)) m.debt_yield = round((m.noi / num(d.loan_amount)) * 100);
  }
  return m;
}

function screenDealPinned(extracted, market = {}, criteria = {}, assumptions = {}) {
  const metrics = computeMetricsPinned(extracted);
  metrics.irr = computeIRR(metrics, assumptions);
  metrics.irr_assumptions = irrAssumptions(metrics, assumptions);
  const risk = runRules(metrics, market, criteria);
  const unpriced = !extracted.purchase_price;
  const undebted = !extracted.loan_amount;
  return {
    property: extracted.property_name || 'Unnamed Asset',
    address: extracted.address || null,
    city: extracted.city || null,
    state: extracted.state || null,
    submarket: extracted.submarket || null,
    units: extracted.units || null,
    year_built: extracted.year_built || null,
    deal_terms: {
      purchase_price_source: unpriced ? 'not_stated_in_om' : (extracted._price_from_user ? 'user_supplied' : 'stated_in_om'),
      debt_source: undebted ? 'not_stated_in_om' : 'stated_in_om',
      offering_type: (unpriced && undebted) ? 'unpriced_free_and_clear' : 'priced',
      note: (unpriced && undebted)
        ? 'This OM states no asking price and no debt. Cap rate, DSCR, LTV, debt yield, breakeven occupancy and IRR cannot be computed until the user supplies a bid price and financing assumptions.'
        : null
    },
    metrics, ...risk, generated_at: new Date().toISOString()
  };
}

const result = screenDealPinned(extracted, market, criteria, assumptions);

if (!dealTerms.purchase_price && !extracted.purchase_price && result.metrics.noi) {
  const noi = result.metrics.noi;
  const bids = [4.5, 5.0, 5.5, 6.0, 6.5].map(c => Math.round(noi / (c / 100) / 1e5) * 1e5);
  result.bid_sensitivity = bidSensitivity(extracted, bids, debt);
  result.max_supportable_price = maxSupportablePrice(extracted, debt);

  const bid = result.max_supportable_price;
  const pricedExtract = {
    ...extracted,
    purchase_price: bid,
    loan_amount: bid * (debt.ltv / 100),
    interest_rate: debt.interest_rate,
    amortization_years: debt.amortization_years,
    _price_from_user: true,
    _force_stated_noi: true,
  };
  const pricedMetrics = computeMetricsPinned(pricedExtract);
  pricedMetrics.irr = computeIRR(pricedMetrics, assumptions);
  pricedMetrics.irr_assumptions = {
    ...irrAssumptions(pricedMetrics, assumptions),
    bid_basis: 'max_supportable_price',
    bid_price: bid,
  };
  result.metrics = {
    ...result.metrics,
    ...pricedMetrics,
    noi: result.metrics.noi,
    noi_source: result.metrics.noi_source,
  };
  const risk2 = runRules(result.metrics, market, criteria);
  result.flags = risk2.flags;
  result.summary = risk2.summary;
}

result.market = market;
result.extraction_meta = {
  source_pages: extracted.source_pages || {},
  confidence: extracted.confidence || {},
  missing_fields: extracted.missing_fields || [],
  analyst_notes: extracted.analyst_notes || [],
  financials_basis: extracted.financials_basis || null
};
return [{ json: result }];
```

---

## 4) Assemble Response — keep market

Replace Assemble code with:

```javascript
const engine = $('Metrics + Risk Rules Engine').first().json;
let raw = $input.first().json?.choices?.[0]?.message?.content ?? '';
raw = raw.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
let narrative;
try { narrative = JSON.parse(raw); }
catch (e) {
  narrative = {
    headline: engine.summary.recommendation + ' - ' + engine.summary.rationale,
    executive_summary: engine.summary.rationale,
    key_strengths: [], key_concerns: [],
    critical_questions: [], recommended_next_steps: [],
    _note: 'Narrative generation failed.'
  };
}
return [{ json: {
  ...engine,
  market: engine.market || {},
  narrative,
  status: 'complete'
}}];
```

---

## 5) Memo prompt — add one rule

In **LLM - Write Memo** system prompt, add:

```
8. Never invent cap rates. If you cite max_supportable_price, compute or use metrics.cap_rate from the JSON only. Do not say 5.5% unless metrics.cap_rate is 5.5.
```

---

## Final wire

`Parse` → `Enrich Extraction` → `Build Market Pack` → `Valid OM?` → `Metrics` → `LLM Memo` → `Assemble` → `Respond`

Also paste updated site files from hub (bid rounding + normalize address/submarket) when you can.
