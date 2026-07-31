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

/** If market has pipeline % but Competitive Supply stayed UNKNOWN, route it into the flag. */
function patchCompetitiveSupply(result, market) {
  const pct = num(market?.pipeline_pct_of_stock);
  if (pct === null) return result;
  const flags = Array.isArray(result.flags) ? [...result.flags] : [];
  const idx = flags.findIndex((f) =>
    /competitive\s*supply|supply\s*pipeline|^supply$/i.test(String(f.rule || f.id || '')),
  );
  let severity = 'PASS';
  if (pct > 15) severity = 'CRITICAL';
  else if (pct > 10) severity = 'HIGH';
  const observed = `${pct}% of stock`;
  const threshold = 'HIGH above 10% / CRITICAL above 15% with flat rent growth';
  const reason =
    market.note ||
    `OM-stated pipeline equals ${pct}% of submarket stock` +
      (market.pipeline_units && market.stock_units
        ? ` (${Number(market.pipeline_units).toLocaleString()} vs ${Number(market.stock_units).toLocaleString()} units).`
        : '.');
  const flag = {
    id: 'supply',
    rule: 'Competitive Supply',
    severity,
    reason,
    observed,
    threshold,
  };
  if (idx >= 0) {
    const existing = flags[idx];
    if (String(existing.severity || '').toUpperCase() === 'UNKNOWN' || existing.observed == null) {
      flags[idx] = { ...existing, ...flag, id: existing.id || 'supply' };
    }
  } else {
    flags.push(flag);
  }
  result.flags = flags;
  if (result.summary) {
    const count = (sev) => flags.filter((f) => String(f.severity).toUpperCase() === sev).length;
    result.summary = {
      ...result.summary,
      critical: count('CRITICAL'),
      high: count('HIGH'),
      unknown: count('UNKNOWN'),
    };
  }
  return result;
}

patchCompetitiveSupply(result, market);

// Prefer enriched address fields on the result (UI reads top-level)
if (!result.address && extracted.address) result.address = extracted.address;
if (!result.city && extracted.city) result.city = extracted.city;
if (!result.state && extracted.state) result.state = extracted.state;
if (!result.submarket && extracted.submarket) result.submarket = extracted.submarket;
if (extracted.full_address && (!result.address || result.address === '—')) {
  result.address = extracted.full_address;
}
if (extracted.zip) result.zip = extracted.zip;

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
  patchCompetitiveSupply(result, market);
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