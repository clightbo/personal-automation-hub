import type { BidRow, Deal } from "./deal-types";

/** Inputs from the Deal Terms form (percent fields are 0–100, not decimals). */
export type BidAssumptions = {
  bid: number;
  ltv: number;
  rate: number;
  amort: number;
  minDscr: number;
  minDy: number;
};

/** Annual debt service for a fully amortizing loan. */
export function annualDebtService(
  loan: number,
  ratePct: number,
  amortYears: number,
): number {
  if (!(loan > 0) || !(amortYears > 0)) return 0;
  const monthlyRate = ratePct / 100 / 12;
  const n = Math.round(amortYears * 12);
  if (monthlyRate === 0) return loan / amortYears;
  const payment =
    (loan * monthlyRate * Math.pow(1 + monthlyRate, n)) /
    (Math.pow(1 + monthlyRate, n) - 1);
  return payment * 12;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Evaluate a single bid rung against in-place NOI. */
export function evaluateBid(
  noi: number,
  units: number,
  bidPrice: number,
  a: Pick<BidAssumptions, "ltv" | "rate" | "amort" | "minDscr" | "minDy">,
  note?: string,
): BidRow {
  const ltv = a.ltv / 100;
  const loan = bidPrice * ltv;
  const capRate = bidPrice > 0 && noi > 0 ? (noi / bidPrice) * 100 : null;
  const debtYield = loan > 0 && noi > 0 ? (noi / loan) * 100 : null;
  const ads = annualDebtService(loan, a.rate, a.amort);
  const dscr = ads > 0 && noi > 0 ? noi / ads : null;
  const financeable =
    dscr !== null &&
    debtYield !== null &&
    dscr >= a.minDscr &&
    debtYield >= a.minDy;
  const negativeLeverage = capRate !== null && capRate < a.rate;

  return {
    bid_price: bidPrice,
    price_per_unit: units > 0 ? Math.round(bidPrice / units) : 0,
    cap_rate: capRate === null ? null : round(capRate, 2),
    dscr: dscr === null ? null : round(dscr, 2),
    debt_yield: debtYield === null ? null : round(debtYield, 1),
    financeable,
    negative_leverage: negativeLeverage,
    note,
  };
}

/**
 * Highest bid that still clears min DSCR and min debt yield at the assumed
 * leverage / rate / amortization.
 */
export function maxSupportablePrice(
  noi: number,
  a: Pick<BidAssumptions, "ltv" | "rate" | "amort" | "minDscr" | "minDy">,
): number {
  if (!(noi > 0) || !(a.ltv > 0)) return 0;
  const ltv = a.ltv / 100;
  const byDy = noi / ((a.minDy / 100) * ltv);
  const factor = annualDebtService(1, a.rate, a.amort);
  const byDscr = factor > 0 ? noi / (a.minDscr * ltv * factor) : Infinity;
  const max = Math.min(byDy, byDscr);
  if (!Number.isFinite(max) || max <= 0) return 0;
  // Round down to nearest $100k so the rung is still financeable after rounding.
  return Math.floor(max / 100_000) * 100_000;
}

/** Build a 7-rung ladder around the entered bid, always including any OM price. */
export function buildBidLadder(
  noi: number,
  units: number,
  a: BidAssumptions,
  statedPrice: number | null = null,
): BidRow[] {
  const center = a.bid > 0 ? a.bid : (statedPrice ?? 0);
  if (!(center > 0)) return [];

  const spreads = [-0.10, -0.05, 0, 0.10, 0.20, 0.35, 0.50];
  const prices = new Set<number>();
  for (const s of spreads) {
    prices.add(Math.round((center * (1 + s)) / 100_000) * 100_000);
  }
  prices.add(Math.round(center / 1000) * 1000);
  if (statedPrice && statedPrice > 0) prices.add(statedPrice);
  // Always include the clearing max-supportable rung at these assumptions.
  const maxCleared = maxSupportablePrice(noi, a);
  if (maxCleared > 0) prices.add(maxCleared);

  const sorted = [...prices].filter((p) => p > 0).sort((x, y) => x - y);
  let taggedNeg = false;

  return sorted.map((bidPrice) => {
    const row = evaluateBid(noi, units, bidPrice, a);
    const notes: string[] = [];
    if (statedPrice && bidPrice === statedPrice) notes.push("OM guidance");
    if (row.negative_leverage && !taggedNeg) {
      notes.push(`cost of debt ${a.rate.toFixed(2)}%`);
      taggedNeg = true;
    }
    return notes.length ? { ...row, note: notes.join(" · ") } : row;
  });
}

/** Rough breakeven occ. from NOI, expense ratio, and annual debt service. */
function estimateBreakeven(
  noi: number,
  expenseRatioPct: number | null,
  ads: number,
): number | null {
  if (!(noi > 0) || expenseRatioPct == null || !(expenseRatioPct > 0) || expenseRatioPct >= 100) {
    return null;
  }
  const egi = noi / (1 - expenseRatioPct / 100);
  if (!(egi > 0)) return null;
  return round(((egi * (expenseRatioPct / 100) + ads) / egi) * 100, 2);
}

/**
 * Recompute bid sensitivity + headline leverage metrics from Deal Terms
 * or a clicked ladder row.
 */
export function applyBidAssumptions(deal: Deal, a: BidAssumptions): Deal {
  const noi = deal.metrics.noi.value;
  if (noi == null || !(noi > 0) || !(a.bid > 0)) {
    return deal;
  }

  const units = deal.property.units || 1;
  const ladder = buildBidLadder(noi, units, a, deal.deal_terms.stated_price);
  const atBid =
    ladder.find((r) => r.bid_price === a.bid) ??
    evaluateBid(noi, units, a.bid, a);
  const maxPrice = maxSupportablePrice(noi, a);
  const loan = a.bid * (a.ltv / 100);
  const ads = annualDebtService(loan, a.rate, a.amort);
  const breakeven = estimateBreakeven(noi, deal.metrics.expense_ratio.value, ads);

  return {
    ...deal,
    metrics: {
      ...deal.metrics,
      cap_rate: { ...deal.metrics.cap_rate, value: atBid.cap_rate },
      dscr: { ...deal.metrics.dscr, value: atBid.dscr },
      debt_yield: { ...deal.metrics.debt_yield, value: atBid.debt_yield },
      ltv: { ...deal.metrics.ltv, value: a.ltv },
      price_per_unit: {
        ...deal.metrics.price_per_unit,
        value: atBid.price_per_unit,
      },
      breakeven_occupancy: {
        ...deal.metrics.breakeven_occupancy,
        value: breakeven ?? deal.metrics.breakeven_occupancy.value,
      },
    },
    bid_sensitivity: ladder,
    max_supportable_price: maxPrice,
  };
}

/** Defaults used when selecting a ladder row (matches Deal Terms form). */
export function defaultBidAssumptions(
  deal: Deal,
  bid: number,
  overrides?: Partial<BidAssumptions>,
): BidAssumptions {
  return {
    bid,
    ltv: deal.metrics.ltv.value ?? 60,
    rate: 6.5,
    amort: 30,
    minDscr: 1.25,
    minDy: 9,
    ...overrides,
  };
}

export function parseAssumptions(raw: {
  bid: string;
  ltv: string;
  rate: string;
  amort: string;
  minDscr: string;
  minDy: string;
}): BidAssumptions | null {
  const bid = Number(String(raw.bid).replace(/[$,\s]/g, ""));
  const ltv = Number(raw.ltv);
  const rate = Number(raw.rate);
  const amort = Number(raw.amort);
  const minDscr = Number(raw.minDscr);
  const minDy = Number(raw.minDy);
  if (![bid, ltv, rate, amort, minDscr, minDy].every((n) => Number.isFinite(n))) {
    return null;
  }
  if (!(bid > 0) || !(ltv > 0) || !(amort > 0)) return null;
  return { bid, ltv, rate, amort, minDscr, minDy };
}
