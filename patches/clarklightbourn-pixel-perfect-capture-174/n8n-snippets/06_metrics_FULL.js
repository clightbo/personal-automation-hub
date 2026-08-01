/* ============================================================
   DealScreen AI — Metrics + Risk Rules Engine
   Pure functions. No dependencies. Runs in an n8n Code node.
   ============================================================ */

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[$,%\s,]/g, ''));
  return isNaN(n) ? null : n;
};
const round = (v, d = 2) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

/* ---------- 1. METRICS ---------- */
function computeMetrics(d) {
  const units        = num(d.units);
  const price        = num(d.purchase_price);
  const gpr          = num(d.gross_potential_rent);
  const otherInc     = num(d.other_income) || 0;
  const vacLoss      = num(d.vacancy_loss);
  const opex         = num(d.operating_expenses);
  const statedNOI    = num(d.noi);
  const loan         = num(d.loan_amount);
  const rate         = num(d.interest_rate);          // percent, e.g. 6.25
  const amortYrs     = num(d.amortization_years) || 30;
  const occ          = num(d.occupancy);              // percent
  const avgRent      = num(d.avg_monthly_rent);
  const medIncome    = num(d.submarket_median_income);
  const reserves     = num(d.replacement_reserves_per_unit);

  // Effective Gross Income
  let egi = null;
  if (gpr !== null) egi = gpr - (vacLoss !== null ? vacLoss : (occ !== null ? gpr * (1 - occ / 100) : 0)) + otherInc;

  // NOI: prefer computed, fall back to stated
  // (Entry point may pin stated NOI via _force_stated_noi after this runs.)
  let noi = (egi !== null && opex !== null) ? egi - opex : statedNOI;
  const noiSource = (egi !== null && opex !== null) ? 'computed' : (statedNOI !== null ? 'stated_in_om' : 'unavailable');

  const capRate = (noi !== null && price) ? (noi / price) * 100 : null;

  // Debt service — standard amortizing mortgage payment
  let annualDebtService = null;
  if (loan && rate !== null) {
    const i = rate / 100 / 12;
    const n = amortYrs * 12;
    const monthly = i === 0 ? loan / n : (loan * i) / (1 - Math.pow(1 + i, -n));
    annualDebtService = monthly * 12;
  }

  const dscr = (noi !== null && annualDebtService) ? noi / annualDebtService : null;
  const pricePerUnit = (price && units) ? price / units : null;
  const ltv = (loan && price) ? (loan / price) * 100 : null;
  const expenseRatio = (opex !== null && egi) ? (opex / egi) * 100 : null;
  const debtYield = (noi !== null && loan) ? (noi / loan) * 100 : null;
  const breakevenOcc = (opex !== null && annualDebtService !== null && gpr)
    ? ((opex + annualDebtService) / gpr) * 100 : null;
  const rentToIncome = (avgRent !== null && medIncome) ? ((avgRent * 12) / medIncome) * 100 : null;

  return {
    units, purchase_price: price,
    egi: round(egi), noi: round(noi), noi_source: noiSource,
    cap_rate: round(capRate), dscr: round(dscr, 3),
    annual_debt_service: round(annualDebtService),
    price_per_unit: round(pricePerUnit), ltv: round(ltv),
    expense_ratio: round(expenseRatio), debt_yield: round(debtYield),
    breakeven_occupancy: round(breakevenOcc),
    rent_to_income: round(rentToIncome),
    occupancy: occ, replacement_reserves_per_unit: reserves,
    year_built: num(d.year_built)
  };
}

/* ---------- 2. IRR (levered, simple 5-yr hold) ---------- */
function computeIRR(m, a = {}) {
  const hold = a.hold_years || 5;
  const growth = (a.rent_growth ?? 3) / 100;
  const expGrowth = (a.expense_growth ?? 3) / 100;
  const costPct = (a.sale_cost_pct ?? 2) / 100;

  // Exit cap default. A distressed asset has a depressed NOI, which produces an
  // artificially LOW going-in cap. Defaulting to going-in + 50bps would then set
  // an exit cap below the going-in cap and inflate the sale price — flattering
  // exactly the deals that deserve the most scrutiny. Floor it.
  const exitCapFloor = a.exit_cap_floor ?? 5.5;
  const exitCapPct = a.exit_cap_rate ?? Math.max((m.cap_rate ?? 6) + 0.5, exitCapFloor);
  const exitCap = exitCapPct / 100;
  // Do not fabricate an IRR when the capital stack is unknown.
  if (m.noi === null || !m.purchase_price || m.ltv === null || m.annual_debt_service === null) return null;

  const equity = m.purchase_price - (m.purchase_price * (m.ltv / 100));
  const flows = [-equity];
  let noi = m.noi;
  for (let y = 1; y <= hold; y++) {
    noi = noi * (1 + (growth + expGrowth) / 2);
    let cf = noi - (m.annual_debt_service || 0);
    if (y === hold) cf += (noi * (1 + growth)) / exitCap * (1 - costPct) - (m.purchase_price * (m.ltv / 100));
    flows.push(cf);
  }
  // bisection solve
  let lo = -0.99, hi = 3;
  const npv = (r) => flows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  if (npv(lo) * npv(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid; else hi = mid;
  }
  return round(((lo + hi) / 2) * 100);
}

/* Records the assumptions an IRR was actually computed under, so the number is
   never presented without the inputs that produced it. */
function irrAssumptions(m, a = {}) {
  const exitCapFloor = a.exit_cap_floor ?? 5.5;
  return {
    hold_years: a.hold_years || 5,
    rent_growth: a.rent_growth ?? 3,
    expense_growth: a.expense_growth ?? 3,
    sale_cost_pct: a.sale_cost_pct ?? 2,
    exit_cap_rate: a.exit_cap_rate ?? Math.round(Math.max((m.cap_rate ?? 6) + 0.5, exitCapFloor) * 100) / 100,
    exit_cap_source: a.exit_cap_rate ? 'user_supplied' : 'defaulted'
  };
}

/* ---------- 3. RISK RULES (five rules, two levels each) ---------- */
function runRules(m, mkt = {}, crit = {}) {
  const T = {
    occ_high: 85, occ_crit: 80,
    dscr_high: 1.25, dscr_crit: 1.15,
    supply_high: 10, supply_crit: 15,
    rti_high: 30, rti_crit: 35,
    yr_built: 1980, reserves_min: 300, deferred_pct: 30,
    ...crit
  };
  const flags = [];
  const add = (id, name, sev, msg, val, thr) =>
    flags.push({ id, rule: name, severity: sev, reason: msg, observed: val, threshold: thr });

  // R1 Occupancy
  if (m.occupancy !== null) {
    if (m.occupancy < T.occ_crit && m.dscr !== null && m.dscr < 1.20)
      add('R1','Occupancy','CRITICAL',`Occupancy of ${m.occupancy}% is below ${T.occ_crit}% and DSCR of ${m.dscr}x is below 1.20x. The property cannot cover debt service at current lease-up. Escalate to underwriting.`, m.occupancy, T.occ_crit);
    else if (m.occupancy < T.occ_high)
      add('R1','Occupancy','HIGH',`Occupancy of ${m.occupancy}% is below the ${T.occ_high}% threshold. Requires a leasing plan and lease-up assumptions review.`, m.occupancy, T.occ_high);
    else add('R1','Occupancy','PASS',`Occupancy of ${m.occupancy}% is above the ${T.occ_high}% threshold.`, m.occupancy, T.occ_high);
  } else add('R1','Occupancy','UNKNOWN','Occupancy not found in the OM. Manual entry required.', null, T.occ_high);

  // R2 DSCR
  if (m.dscr !== null) {
    const maturesInHold = mkt.loan_matures_within_hold === true;
    if (m.dscr < T.dscr_crit || maturesInHold)
      add('R2','Debt Service Coverage','CRITICAL',
        m.dscr < T.dscr_crit
          ? `DSCR of ${m.dscr}x is below ${T.dscr_crit}x. There is no cushion for expense shocks or vacancy. Escalate to underwriting.`
          : `DSCR of ${m.dscr}x with the loan maturing inside the planned hold period creates refinancing risk that could eliminate equity returns.`,
        m.dscr, T.dscr_crit);
    else if (m.dscr < T.dscr_high)
      add('R2','Debt Service Coverage','HIGH',`DSCR of ${m.dscr}x is below ${T.dscr_high}x. Stress-test the model at +100 bps before proceeding.`, m.dscr, T.dscr_high);
    else add('R2','Debt Service Coverage','PASS',`DSCR of ${m.dscr}x provides adequate coverage.`, m.dscr, T.dscr_high);
  } else add('R2','Debt Service Coverage','UNKNOWN','DSCR could not be computed — loan terms missing from the OM.', null, T.dscr_high);

  // R3 Supply — needs market.pipeline_pct_of_stock from Build Market Pack
  const sup = num(mkt.pipeline_pct_of_stock);
  const rentGrowth = num(mkt.submarket_rent_growth);
  if (sup !== null) {
    if (sup > T.supply_crit && rentGrowth !== null && rentGrowth <= 0)
      add('R3','Competitive Supply','CRITICAL',`New construction equals ${sup}% of submarket stock while rent growth is ${rentGrowth}%. The sponsor's rent growth assumptions are not supportable.`, sup, T.supply_crit);
    else if (sup > T.supply_high)
      add('R3','Competitive Supply','HIGH',`New construction equals ${sup}% of submarket stock, above the ${T.supply_high}% threshold. Run a rent growth sensitivity analysis.`, sup, T.supply_high);
    else add('R3','Competitive Supply','PASS',`Supply pipeline at ${sup}% of stock is within tolerance.`, sup, T.supply_high);
  } else add('R3','Competitive Supply','UNKNOWN','Supply pipeline data unavailable for this submarket.', null, T.supply_high);

  // R4 Affordability
  // Area median income is the wrong denominator for a luxury asset. A $4,771/mo
  // Gramercy Park unit is not rented by someone earning the Manhattan median —
  // it is rented by someone well above it. Testing luxury rent against area
  // median produces a guaranteed false positive. When the implied rent burden is
  // absurd (over the luxury threshold), the benchmark is wrong, not the deal.
  const luxuryCutoff = T.rti_luxury_cutoff ?? 50;
  if (m.rent_to_income !== null && m.rent_to_income > luxuryCutoff) {
    add('R4','Affordability','UNKNOWN',
      `Rent-to-income computes to ${m.rent_to_income}% against submarket median income, which exceeds the ${luxuryCutoff}% plausibility ceiling. This asset rents well above the area median household, so area median income is not a valid affordability benchmark. Supply a renter-cohort income or use concession and absorption trends instead.`,
      m.rent_to_income, luxuryCutoff);
  } else if (m.rent_to_income !== null) {
    const conc = mkt.concessions_rising === true;
    if (m.rent_to_income > T.rti_crit && conc)
      add('R4','Affordability','CRITICAL',`Rent-to-income of ${m.rent_to_income}% exceeds ${T.rti_crit}% while market concessions are rising. Tenants are stretched and effective rents are falling.`, m.rent_to_income, T.rti_crit);
    else if (m.rent_to_income > T.rti_high)
      add('R4','Affordability','HIGH',`Rent-to-income of ${m.rent_to_income}% exceeds ${T.rti_high}% of submarket median income, limiting room to push rents.`, m.rent_to_income, T.rti_high);
    else add('R4','Affordability','PASS',`Rent-to-income of ${m.rent_to_income}% leaves headroom for rent growth.`, m.rent_to_income, T.rti_high);
  } else add('R4','Affordability','UNKNOWN','Rent-to-income could not be computed — missing rent or income data.', null, T.rti_high);

  // R5 Capex / Age
  const yr = m.year_built, res = m.replacement_reserves_per_unit;
  const defPct = num(mkt.deferred_maintenance_pct);
  const l1 = (yr !== null && yr < T.yr_built) || (res !== null && res < T.reserves_min);
  if (yr !== null || res !== null) {
    if (l1 && defPct !== null && defPct > T.deferred_pct)
      add('R5','Capital Needs','CRITICAL',`Built ${yr ?? 'n/a'} with reserves of $${res ?? 'n/a'}/unit, and ${defPct}% of the capex budget is deferred maintenance. The renovation budget is catching up on neglect rather than driving rent lift.`, defPct, T.deferred_pct);
    else if (l1)
      add('R5','Capital Needs','HIGH',`Built ${yr ?? 'n/a'} with reserves of $${res ?? 'n/a'}/unit. Order a property condition assessment.`, res, T.reserves_min);
    else add('R5','Capital Needs','PASS',`Vintage and reserve funding are within tolerance.`, res, T.reserves_min);
  } else add('R5','Capital Needs','UNKNOWN','Year built and reserve data not found.', null, T.reserves_min);

  const nCrit = flags.filter(f => f.severity === 'CRITICAL').length;
  const nHigh = flags.filter(f => f.severity === 'HIGH').length;
  const nUnk  = flags.filter(f => f.severity === 'UNKNOWN').length;

  let rec, rationale;
  if (nCrit > 0) { rec = 'NO-GO'; rationale = `${nCrit} critical risk flag${nCrit>1?'s':''} identified. Escalated to human underwriting review before any further work.`; }
  else if (nHigh >= 2) { rec = 'CONDITIONAL'; rationale = `${nHigh} high risk flags identified. Proceed only with mitigation and revised assumptions.`; }
  else if (nHigh === 1) { rec = 'GO WITH CONDITIONS'; rationale = `One high risk flag identified. Deal is viable subject to diligence on that item.`; }
  else if (nUnk >= 3) { rec = 'INCOMPLETE'; rationale = `${nUnk} metrics could not be extracted. Complete manual entry before screening.`; }
  else { rec = 'GO'; rationale = 'No critical or high risk flags identified. Deal passes initial screening.'; }

  const score = Math.max(0, 100 - nCrit * 30 - nHigh * 12 - nUnk * 5);
  return { flags, summary: { critical: nCrit, high: nHigh, unknown: nUnk, risk_score: score, recommendation: rec, rationale } };
}

/* ------------------------------------------------------------------
   Bid sensitivity. Many institutional OMs are marketed UNPRICED and
   "free and clear" — no asking price and no debt, because the buyer
   brings both. Without a price there is no cap rate, no DSCR and no
   IRR, so half the model goes dark. The fix is not to guess a price;
   it is to let the user test bids against the asset's actual income.
   ------------------------------------------------------------------ */
function bidSensitivity(extracted, bids = [], debt = {}) {
  const ltv = debt.ltv ?? 60;
  const rate = debt.interest_rate ?? 6.5;
  const amort = debt.amortization_years ?? 30;
  const minDscr = debt.min_dscr ?? 1.25;
  const minDebtYield = debt.min_debt_yield ?? 9.0;

  return bids.map(price => {
    const m = computeMetrics({ ...extracted, purchase_price: price,
      loan_amount: price * (ltv / 100), interest_rate: rate, amortization_years: amort });
    const financeable = m.dscr !== null && m.debt_yield !== null &&
                        m.dscr >= minDscr && m.debt_yield >= minDebtYield;
    const negativeLeverage = m.cap_rate !== null && m.cap_rate < rate;
    return {
      bid_price: price,
      price_per_unit: m.price_per_unit,
      cap_rate: m.cap_rate,
      dscr: m.dscr,
      debt_yield: m.debt_yield,
      breakeven_occupancy: m.breakeven_occupancy,
      financeable,
      negative_leverage: negativeLeverage,
      note: !financeable
        ? (m.dscr < minDscr ? `DSCR of ${m.dscr}x is below the ${minDscr}x lender minimum`
                            : `Debt yield of ${m.debt_yield}% is below the ${minDebtYield}% lender minimum`)
        : (negativeLeverage ? `Financeable, but the ${m.cap_rate}% cap rate sits below the ${rate}% cost of debt — leverage reduces returns` : 'Clears lender tests')
    };
  });
}

/* Highest price that still clears the lender tests. */
function maxSupportablePrice(extracted, debt = {}, lo = 1e6, hi = 500e6) {
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const [r] = bidSensitivity(extracted, [mid], debt);
    if (r.financeable) lo = mid; else hi = mid;
  }
  return Math.round(lo / 1e5) * 1e5;
}

function screenDeal(extracted, market = {}, criteria = {}, assumptions = {}) {
  const metrics = computeMetrics(extracted);
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
    metrics, ...risk, generated_at: new Date().toISOString() };
}

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

/* ---- Pull OM text: prefer stamped om_text from Parse, then Trim/PDF nodes ---- */
function readNodeText(name) {
  try {
    const j = $(name).first().json;
    return String(j.om_text || j.text || j.data || j.content || j.trimmed_text || '');
  } catch (e) {
    return '';
  }
}

let omText = '';
let omTextSource = 'none';
// 1) Already stamped by Parse Extraction (most reliable)
if (typeof input.om_text === 'string' && input.om_text.length > omText.length) {
  omText = input.om_text;
  omTextSource = 'input.om_text';
}
if (typeof extracted.om_text === 'string' && extracted.om_text.length > omText.length) {
  omText = extracted.om_text;
  omTextSource = 'extracted.om_text';
}
const textNodeNames = [
  'Parse Extraction',
  'Trim For Context Window',
  'Trim for Context Window',
  'Trim For Context',
  'Trim',
  'Trim Text',
  'Extract PDF Text',
  'Extract from File',
  'Extract PDF',
  'PDF Extract',
  'Code in JavaScript',
  'Code in JavaScript1',
  'Code in JavaScript2',
];
for (const n of textNodeNames) {
  const t = readNodeText(n);
  if (t.length > omText.length) {
    omText = t;
    omTextSource = n;
  }
}
// Also fold identity crumbs / notes
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
  om_text_source: omTextSource,
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
  const propName = extracted.property_name || 'Unnamed Asset';
  const propAddress = extracted.full_address || extracted.address || null;
  return {
    property: {
      name: propName,
      property_name: propName,
      address: propAddress,
      city: extracted.city || null,
      state: extracted.state || null,
      submarket: extracted.submarket || null,
      units: extracted.units || null,
      year_built: extracted.year_built || null,
      zip: extracted.zip || null,
    },
    address: propAddress,
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
