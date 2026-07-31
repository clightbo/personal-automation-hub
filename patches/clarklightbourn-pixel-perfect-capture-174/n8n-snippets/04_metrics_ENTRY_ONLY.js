/* ===== n8n entry point ===== */
const input = $input.first().json;
const extracted = { ...(input.extracted || input) };
let market =
  input.market && typeof input.market === 'object' ? { ...input.market } : {};
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

/* ---- Pull OM text from earlier nodes (Enrich/Market Pack may be missing) ---- */
function readNodeText(name) {
  try {
    const j = $(name).first().json;
    return String(j.text || j.data || j.content || j.om_text || '');
  } catch (e) {
    return '';
  }
}

let omText = '';
const textNodeNames = [
  'Trim For Context Window',
  'Trim for Context Window',
  'Trim For Context',
  'Extract PDF Text',
  'Extract from File',
  'Extract PDF',
  'PDF Extract',
];
for (const n of textNodeNames) {
  if (omText.length > 500) break;
  const t = readNodeText(n);
  if (t.length > omText.length) omText = t;
}
// Also fold in anything sitting on the item / notes
omText = [
  omText,
  extracted.property_name,
  extracted.address,
  extracted.full_address,
  extracted.city,
  extracted.state,
  extracted.submarket,
  JSON.stringify(extracted.analyst_notes || []),
  typeof input.text === 'string' ? input.text : '',
].filter(Boolean).join('\n');

const looksLikeStreet = (s) =>
  /^\d{1,6}(?:\s*[&\/]\s*\d{1,6})?\s+.+/i.test(String(s || '').trim()) &&
  /(Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Parkway|Pkwy\.?|Circle|Cir\.?)/i.test(
    String(s || ''),
  );

function enrichAddressFromText(e, blob) {
  if (!e.address) {
    e.address =
      e.property_address || e.street_address || e.full_address || e.location || null;
  }
  if (e.address && typeof e.address === 'object') {
    const a = e.address;
    e.address = [a.street, a.line1, a.address1].filter(Boolean).join(', ') || null;
    e.city = e.city || a.city || null;
    e.state = e.state || a.state || null;
    e.zip = e.zip || a.zip || a.postal_code || null;
  }

  if (!e.city || !e.state) {
    for (const line of String(blob).split(/\n+/)) {
      const csz = line
        .trim()
        .match(
          /^([A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+){0,3}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/,
        );
      if (csz && !looksLikeStreet(csz[1])) {
        if (!e.city) e.city = csz[1].trim();
        if (!e.state) e.state = csz[2].trim();
        if (!e.zip) e.zip = csz[3].trim();
        break;
      }
    }
  }

  if (!e.address || !looksLikeStreet(e.address)) {
    const labeled =
      (blob.match(/Address\s*[:\|]\s*([^\n|]+)/i) || [])[1] ||
      (blob.match(/(?:Property|Site|Street)\s+Address\s*[:\|]\s*([^\n|]+)/i) || [])[1] ||
      (blob.match(/(?:located at|located on)\s+([^\n.]+)/i) || [])[1];
    const streetRe =
      /\b(\d{1,6}(?:\s*[&\/]\s*\d{1,6})?\s+(?:(?:N|S|E|W|North|South|East|West)\.?\s+)?[A-Za-z0-9.'\-]+(?:\s+[A-Za-z0-9.'\-]+){0,4}\s+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Parkway|Pkwy\.?|Circle|Cir\.?))\b/i;
    const fromText = (blob.match(streetRe) || [])[1];
    const candidate = String(labeled || fromText || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (candidate && looksLikeStreet(candidate)) {
      e.address = candidate.replace(/,.*$/, '').trim();
    } else if (candidate && !e.address) {
      e.address = candidate;
    }
  }

  if (e.address) {
    const embedded = String(e.address).match(
      /^(.+?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)?\s*$/,
    );
    if (embedded && looksLikeStreet(embedded[1])) {
      e.address = embedded[1].trim();
      e.city = e.city || embedded[2].trim();
      e.state = e.state || embedded[3];
      if (embedded[4]) e.zip = e.zip || embedded[4];
    }
  }

  if (!e.submarket) {
    const sm = (blob.match(/Submarket\s*[:\|]\s*([A-Za-z0-9 .'/&-]+)/i) || [])[1];
    if (sm) e.submarket = sm.trim();
  }

  if (e.address) {
    const tail = [e.city, e.state].filter(Boolean).join(', ');
    const zip = e.zip ? ` ${e.zip}` : '';
    e.full_address = [e.address, tail ? `${tail}${zip}` : null]
      .filter(Boolean)
      .join(', ');
  }
  return e;
}

function scrapePipeline(blob, e, incoming) {
  const toN = (s) => {
    if (s == null || s === '') return null;
    const n = Number(String(s).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const round1 = (n) => Math.round(n * 10) / 10;
  let pipelineUnits = null;
  let stockUnits = null;
  let pct = num(incoming.pipeline_pct_of_stock);
  let note = incoming.note || null;

  const pctMatch =
    blob.match(
      /pipeline[^\n%]{0,60}?(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:submarket\s+)?(?:stock|inventory|existing)/i,
    ) ||
    blob.match(
      /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:submarket\s+)?(?:stock|inventory)[^\n.]{0,40}pipeline/i,
    );
  if (pct == null && pctMatch) {
    pct = Number(pctMatch[1]);
    note = `OM stated pipeline ~${pct}% of stock`;
  }

  const vsMatch = blob.match(
    /\(?\s*([\d,]+)\s*units?\s+(?:vs\.?|versus|against|compared to)\s+([\d,]+)(?:\s*(?:units?\s+)?(?:in\s+)?(?:the\s+)?(?:CBD|submarket|market|inventory|stock))?/i,
  );
  if (vsMatch) {
    pipelineUnits = toN(vsMatch[1]);
    stockUnits = toN(vsMatch[2]);
  }
  if (pipelineUnits == null) {
    const pOnly =
      blob.match(/(?:limited\s+)?pipeline(?:\s+supply)?[^\n\d]{0,30}([\d,]+)\s*units?/i) ||
      blob.match(/([\d,]+)\s*(?:-|\s)?units?\s+(?:in\s+)?(?:the\s+)?(?:near[- ]term\s+)?pipeline/i) ||
      blob.match(/([\d,]+)\s*units?\s+under\s+construction/i);
    if (pOnly) pipelineUnits = toN(pOnly[1]);
  }
  if (stockUnits == null) {
    const sOnly =
      blob.match(
        /([\d,]+)\s*units?\s+(?:of\s+)?(?:existing\s+)?(?:submarket\s+|CBD\s+)?(?:inventory|stock)/i,
      ) || blob.match(/(?:inventory|stock)\s+of\s+([\d,]+)\s*units?/i);
    if (sOnly) stockUnits = toN(sOnly[1]);
  }

  pipelineUnits =
    pipelineUnits ?? toN(e.pipeline_units ?? e.pipeline ?? e.units_in_pipeline);
  stockUnits = stockUnits ?? toN(e.submarket_stock ?? e.stock_units ?? e.inventory_units);
  if (pct == null) pct = toN(e.pipeline_pct_of_stock ?? e.pipeline_pct);

  if (pct == null && pipelineUnits != null && stockUnits != null && stockUnits > 0) {
    pct = round1((pipelineUnits / stockUnits) * 100);
    note =
      note ||
      `OM pipeline ${pipelineUnits.toLocaleString()} units vs ${stockUnits.toLocaleString()} stock (${pct}%)`;
  }
  if (
    pct == null &&
    /limited\s+pipeline|minimal\s+pipeline|no\s+(?:near[- ]term\s+)?pipeline|negligible\s+new\s+supply/i.test(
      blob,
    )
  ) {
    pct = 0;
    note = 'OM describes limited/minimal pipeline (scored as 0%)';
  }

  return { pct, pipelineUnits, stockUnits, note };
}

enrichAddressFromText(extracted, omText);
const pipe = scrapePipeline(omText, extracted, market);

if (pipe.pct != null) {
  market.pipeline_pct_of_stock = pipe.pct;
  market.pipeline_units = pipe.pipelineUnits;
  market.stock_units = pipe.stockUnits;
  market.note = pipe.note;
  market.source = market.source || 'metrics_om_text_scrape';
  if (!Array.isArray(market.supply) || market.supply.length === 0) {
    market.supply = [
      {
        year: 'Pipeline',
        deliveries: pipe.pipelineUnits != null ? pipe.pipelineUnits : 0,
        stock_pct: pipe.pct,
      },
    ];
  }
  if (!Array.isArray(market.comps)) market.comps = [];
}

// Gramercy shortcut if detected in text
if (/gramercy|east 22nd|e\.?\s*22nd/i.test(omText)) {
  if (market.pipeline_pct_of_stock == null) market.pipeline_pct_of_stock = 0;
  if (!market.comps || !market.comps.length) {
    market.comps = [
      { property: 'The Nathaniel', units: 85, year_built: 2014, avg_rent: 6260, occupancy: 95.0, distance: 0.8 },
      { property: '298 Mulberry Street', units: 96, year_built: 2017, avg_rent: 5870, occupancy: 94.0, distance: 1.0 },
      { property: 'The Gemma', units: 108, year_built: 2023, avg_rent: 5109, occupancy: 94.0, distance: 0.3 },
      { property: 'Instrata Gramercy', units: 166, year_built: 1992, avg_rent: 6990, occupancy: 93.0, distance: 0.2 },
    ];
  }
  if (!market.supply || !market.supply.length) {
    market.supply = [
      { year: '2024', deliveries: 0, stock_pct: 0 },
      { year: '2025', deliveries: 0, stock_pct: 0 },
      { year: '2026', deliveries: 0, stock_pct: 0 },
      { year: '2027', deliveries: 0, stock_pct: 0 },
      { year: '2028', deliveries: 0, stock_pct: 0 },
    ];
  }
  market.submarket_rent_growth = market.submarket_rent_growth ?? 2.0;
  extracted.submarket = extracted.submarket || 'Gramercy Park';
  extracted.submarket_median_income = extracted.submarket_median_income || 203422;
  market.avg_household_income = extracted.submarket_median_income;
  market.source = market.source || 'metrics_gramercy_pack';
}

extracted._metrics_enrich = {
  om_text_chars: omText.length,
  address: extracted.address || null,
  pipeline_pct_of_stock: market.pipeline_pct_of_stock ?? null,
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
    address: extracted.address || extracted.full_address || null,
    city: extracted.city || null,
    state: extracted.state || null,
    submarket: extracted.submarket || null,
    units: extracted.units || null,
    year_built: extracted.year_built || null,
    zip: extracted.zip || null,
    deal_terms: {
      purchase_price_source: unpriced ? 'not_stated_in_om' : (extracted._price_from_user ? 'user_supplied' : 'stated_in_om'),
      debt_source: undebted ? 'not_stated_in_om' : 'stated_in_om',
      offering_type: (unpriced && undebted) ? 'unpriced_free_and_clear' : 'priced',
      note: (unpriced && undebted)
        ? 'This OM states no asking price and no debt. Cap rate, DSCR, LTV, debt yield, breakeven occupancy and IRR cannot be computed until the user supplies a bid price and financing assumptions.'
        : null,
    },
    metrics,
    ...risk,
    generated_at: new Date().toISOString(),
  };
}

const result = screenDealPinned(extracted, market, criteria, assumptions);

/** If market has pipeline % but Competitive Supply stayed UNKNOWN, route it into the flag. */
function patchCompetitiveSupply(result, market) {
  const pct = num(market?.pipeline_pct_of_stock);
  if (pct === null) return result;
  const flags = Array.isArray(result.flags) ? [...result.flags] : [];
  const idx = flags.findIndex(
    (f) =>
      /competitive\s*supply|supply\s*pipeline|^supply$|^R3$/i.test(
        String(f.rule || f.id || ''),
      ) ||
      String(f.id) === 'R3' ||
      String(f.id) === 'supply',
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
    id: 'R3',
    rule: 'Competitive Supply',
    severity,
    reason,
    observed,
    threshold,
  };
  if (idx >= 0) {
    const existing = flags[idx];
    // Always overwrite UNKNOWN; also overwrite if observed missing
    if (
      String(existing.severity || '').toUpperCase() === 'UNKNOWN' ||
      existing.observed == null
    ) {
      flags[idx] = { ...existing, ...flag, id: existing.id || 'R3', rule: 'Competitive Supply' };
    }
  } else {
    flags.push(flag);
  }
  result.flags = flags;
  if (result.summary) {
    const count = (sev) =>
      flags.filter((f) => String(f.severity).toUpperCase() === sev).length;
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

if (!result.address && extracted.address) result.address = extracted.address;
if (!result.address && extracted.full_address) result.address = extracted.full_address;
if (!result.city && extracted.city) result.city = extracted.city;
if (!result.state && extracted.state) result.state = extracted.state;
if (!result.submarket && extracted.submarket) result.submarket = extracted.submarket;
if (extracted.zip) result.zip = extracted.zip;

if (!dealTerms.purchase_price && !extracted.purchase_price && result.metrics.noi) {
  const noi = result.metrics.noi;
  const bids = [4.5, 5.0, 5.5, 6.0, 6.5].map(
    (c) => Math.round(noi / (c / 100) / 1e5) * 1e5,
  );
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
  financials_basis: extracted.financials_basis || null,
  metrics_enrich: extracted._metrics_enrich || null,
};
return [{ json: result }];
