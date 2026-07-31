# n8n fix: stop NOI drift + fill IRR on unpriced deals

## What’s wrong in YOUR workflow

1. **NOI changes every run** → `LLM - Extract OM` (free Nemotron) re-extracts GPR/opex/NOI differently; your Code node then does `egi - opex` when both exist, so computed NOI swings ($5.7M / $6.5M / $7.1M).
2. **IRR always blank on unpriced OMs** → `computeIRR` requires `purchase_price` + loan. Unpriced deals have neither, and you never recompute IRR after `max_supportable_price`.
3. **Competitive supply UNKNOWN + empty Market** → there is **no market node**. Frontend sends `market: {}`. Rules correctly return UNKNOWN.
4. **Memo temp 0.2** → wording changes (fine); should not change numbers if extract is stable.

Extract already has `temperature: 0` — good. Free models still drift; pin the calc.

---

## Fix A — paste into **Metrics + Risk Rules Engine** (replace the bottom entry point)

Keep all your helper functions. Replace only from `/* ===== n8n entry point ===== */` to the end with:

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

// Prefer the OM's stated NOI when present — don't recompute from noisy GPR/opex extracts.
// That is the main cause of $5.7M vs $7.1M swings on the same PDF.
if (num(extracted.noi) !== null) {
  extracted._force_stated_noi = true;
}

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
    // Recompute price-dependent fields only when price exists
    if (m.purchase_price && m.noi !== null) {
      m.cap_rate = round((m.noi / m.purchase_price) * 100);
    }
    if (m.noi !== null && m.annual_debt_service) {
      m.dscr = round(m.noi / m.annual_debt_service, 3);
    }
    if (m.noi !== null && num(d.loan_amount)) {
      m.debt_yield = round((m.noi / num(d.loan_amount)) * 100);
    }
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
        ? 'This OM states no asking price and no debt. Cap rate, DSCR, LTV, debt yield, breakeven occupancy and IRR cannot be computed until the user supplies a bid price and financing assumptions. Use bidSensitivity() to test prices.'
        : null
    },
    metrics, ...risk, generated_at: new Date().toISOString()
  };
}

const result = screenDealPinned(extracted, market, criteria, assumptions);

// Unpriced: build ladder, then PRICE THE STACK at max supportable so IRR/DSCR exist
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
  // Keep pinned NOI; overwrite leverage metrics + IRR
  result.metrics = {
    ...result.metrics,
    ...pricedMetrics,
    noi: result.metrics.noi,
    noi_source: result.metrics.noi_source,
  };
  // Re-run DSCR rule with modeled coverage
  const risk2 = runRules(result.metrics, market, criteria);
  result.flags = risk2.flags;
  result.summary = risk2.summary;
}

result.extraction_meta = {
  source_pages: extracted.source_pages || {},
  confidence: extracted.confidence || {},
  missing_fields: extracted.missing_fields || [],
  analyst_notes: extracted.analyst_notes || [],
  financials_basis: extracted.financials_basis || null
};
return [{ json: result }];
```

Also change **one line** inside `computeMetrics` NOI selection if you prefer not to use `_force_stated_noi` helper — the pinned path above already overrides.

---

## Fix B — Extract prompt (small add)

In **LLM - Extract OM** system prompt, add:

```
9b. For NOI: if both T-12 and pro forma appear, ALWAYS take T-12 / in-place NOI and set financials_basis accordingly. Never blend. If multiple NOI candidates exist, pick the single figure labeled T-12 or Trailing 12 Months and put other candidates only in analyst_notes.
9c. Return the same numeric extraction on repeated runs — do not reinterpret tables.
```

Keep `temperature: 0`.

Optional: switch model from free Nemotron to a paid stable extract model if drift continues.

---

## Fix C — Market / competitive supply

Your workflow has **zero market research**. Add a node after Parse Extraction that sets e.g.:

```json
{
  "pipeline_pct_of_stock": 0.9,
  "submarket_rent_growth": 2.0,
  "comps": [...],
  "supply": [...]
}
```

Until that exists, Competitive Supply stays UNKNOWN and Market Research stays empty. That’s correct behavior.

---

## Fix D — Website (already prepared)

Homepage should send default `deal_terms` / `assumptions` (ltv 60, rate 6.5, hold 5) instead of `{}`. Copy updated `index.tsx` when ready.

---

## Expected after Fix A
- Same PDF → **same NOI** (pinned stated extract)
- Unpriced deals get **IRR** at max-supportable bid
- DSCR flag can PASS/HIGH from modeled debt
- Market still empty until Fix C
