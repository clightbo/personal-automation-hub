import type { Deal, Metric } from "./deal-types";

export type MetricBasis = "om" | "modeled";

export type MetricKey =
  | "noi"
  | "cap_rate"
  | "dscr"
  | "irr"
  | "price_per_unit"
  | "ltv"
  | "debt_yield"
  | "expense_ratio"
  | "breakeven_occupancy"
  | "occupancy"
  | "rent_to_income";

const MODELED_NOTE =
  "Modeled — not stated as this figure in the OM. Uses an assumed bid and/or financing / hold-period assumptions.";

const OM_NOTE = "Extracted or computed directly from figures stated in the OM.";

export function isUnpricedDeal(deal: Deal): boolean {
  const src = String(deal.deal_terms.purchase_price_source || "");
  const offering = String(deal.deal_terms.offering_type || "");
  return (
    deal.deal_terms.stated_price == null ||
    src === "not_stated_in_om" ||
    src === "user_supplied" ||
    /unpriced/i.test(offering)
  );
}

export function isDebtAssumed(deal: Deal): boolean {
  const src = String(deal.deal_terms.debt_source || "");
  return !src || src === "not_stated_in_om";
}

/**
 * Which metrics are OM-stated vs underwriting-model output.
 * Price/debt-dependent yields are modeled on unpriced / free-and-clear OMs.
 */
export function metricBasis(deal: Deal, key: MetricKey, metric?: Metric): MetricBasis {
  // If the extract cited an OM page for this metric, treat as OM-sourced.
  if (metric?.page && key !== "irr") return "om";

  const unpriced = isUnpricedDeal(deal);
  const debtAssumed = isDebtAssumed(deal);

  switch (key) {
    case "irr":
      return "modeled";
    case "cap_rate":
    case "price_per_unit":
      return unpriced ? "modeled" : "om";
    case "dscr":
    case "debt_yield":
    case "ltv":
    case "breakeven_occupancy":
      return unpriced || debtAssumed ? "modeled" : "om";
    case "rent_to_income":
      // Usually blends OM rent with market/census income — call it modeled unless paged.
      return "modeled";
    case "noi":
    case "occupancy":
    case "expense_ratio":
    default:
      return "om";
  }
}

export function basisLabel(basis: MetricBasis): string {
  return basis === "modeled" ? "Modeled" : "OM";
}

export function basisTooltip(basis: MetricBasis, deal: Deal): string {
  if (basis === "om") return OM_NOTE;
  const bid =
    deal.max_supportable_price > 0
      ? ` Current screen uses max supportable ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(deal.max_supportable_price)} when the OM has no ask.`
      : "";
  return MODELED_NOTE + bid;
}
