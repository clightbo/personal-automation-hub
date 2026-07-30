import type { Deal, DealMetrics, Metric, Recommendation, Severity } from "./deal-types";

const STORAGE_KEY = "dealscreen:results";

const memory = new Map<string, Deal>();

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "screened-deal"
  );
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.replace(/[$,%\s,]/g, "")))
      ? Number(v.replace(/[$,%\s,]/g, ""))
      : null;

const metric = (v: unknown): Metric => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return { value: num(o.value ?? o.amount ?? o.val), page: num(o.page ?? o.source_page) ?? undefined };
  }
  return { value: num(v) };
};

/** Coerce webhook values to display strings without emitting "[object Object]". */
const str = (v: unknown, fallback = ""): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v == null) return fallback;
  if (Array.isArray(v)) {
    const parts = v.map((item) => str(item)).filter(Boolean);
    return parts.length ? parts.join("; ") : fallback;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const nested =
      o.text ??
      o.value ??
      o.content ??
      o.summary ??
      o.title ??
      o.label ??
      o.item ??
      o.name ??
      o.description ??
      o.reason ??
      o.detail;
    if (nested != null && nested !== v) return str(nested, fallback);
    return fallback;
  }
  return fallback;
};

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const looksLikeAddress = (s: string) => /^\d+\s+\S+/.test(s.trim());

/**
 * n8n sometimes returns property as a bare string, swaps name/address, or packs
 * both into one field ("Name — 123 Main St"). Normalize to a clean pair.
 */
function parseNameAddress(
  nameRaw: string,
  addressRaw: string,
): { name: string; address: string } {
  let name = nameRaw.trim();
  let address = addressRaw.trim();

  if (looksLikeAddress(name) && address && !looksLikeAddress(address)) {
    [name, address] = [address, name];
  }

  if (!address) {
    const splitEm =
      name.match(/^(.*?)\s+[—–]\s+(.+)$/) ||
      name.match(/^(.*?)\s+\|\s+(.+)$/) ||
      name.match(/^([^,\n]+),\s+(\d+\s+.+)$/) ||
      name.match(/^([^\n]+)\n+(.+)$/);
    if (splitEm) {
      const left = splitEm[1].trim();
      const right = splitEm[2].trim();
      if (looksLikeAddress(right) && !looksLikeAddress(left)) {
        name = left;
        address = right;
      } else if (looksLikeAddress(left) && !looksLikeAddress(right)) {
        name = right;
        address = left;
      }
    }
  }

  return {
    name: name || "Screened Deal",
    address: address || "Address not stated in OM",
  };
}

/** source_pages may be a number, an array of page refs, or an object map. */
const countPages = (v: unknown): number => {
  if (Array.isArray(v)) return v.length;
  const n = num(v);
  if (n !== null) return n;
  if (v && typeof v === "object") return Object.keys(v as object).length;
  return 0;
};

const CONFIDENCE_WORDS: Record<string, number> = {
  high: 0.95,
  "very high": 0.98,
  medium: 0.75,
  moderate: 0.75,
  low: 0.5,
  "very low": 0.3,
  unknown: 0,
};

const confidenceValue = (v: unknown): number | null => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return confidenceValue(o.confidence ?? o.level ?? o.value ?? o.score);
  }
  const n = num(v);
  if (n !== null) return n > 1 ? n / 100 : n;
  const w = str(v).trim().toLowerCase();
  return w in CONFIDENCE_WORDS ? CONFIDENCE_WORDS[w] : null;
};

/** confidence may be a number, a word, or a list/map of per-field levels — average them. */
const avgConfidence = (v: unknown): number => {
  const items = Array.isArray(v)
    ? v
    : v && typeof v === "object" && confidenceValue(v) === null
      ? Object.values(v as object)
      : [v];
  const vals = items.map(confidenceValue).filter((n): n is number => n !== null);
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "PASS", "UNKNOWN"];
const severity = (v: unknown): Severity => {
  const s = str(v).toUpperCase();
  return (SEVERITIES.find((x) => x === s) as Severity) ?? "UNKNOWN";
};

const RECS: Recommendation[] = ["GO", "GO WITH CONDITIONS", "CONDITIONAL", "NO-GO"];
const recommendation = (v: unknown): Recommendation => {
  const s = str(v).toUpperCase().replace(/_/g, " ");
  return (RECS.find((x) => x === s) as Recommendation) ?? "CONDITIONAL";
};

/** Unwrap common webhook envelopes: [{...}], { data: {...} }, { json: {...} }, { output: {...} } */
function unwrap(raw: unknown): Record<string, unknown> {
  let cur: unknown = raw;
  for (let i = 0; i < 6; i++) {
    if (Array.isArray(cur)) {
      cur = cur[0];
      continue;
    }
    const o = obj(cur);
    const keys = Object.keys(o);
    const nested = ["data", "json", "output", "result", "body", "deal", "analysis"].find(
      (k) => keys.includes(k) && (typeof o[k] === "object" || typeof o[k] === "string"),
    );
    if (nested && !keys.includes("metrics") && !keys.includes("property")) {
      let next = o[nested];
      if (typeof next === "string") {
        try {
          next = JSON.parse(next);
        } catch {
          return o;
        }
      }
      cur = next;
      continue;
    }
    return o;
  }
  return obj(cur);
}

/** Normalize an arbitrary webhook payload into the Deal shape the dashboard renders. */
export function normalizeDeal(raw: unknown): Deal {
  const r = unwrap(raw);
  const propertyRaw = r.property ?? r.subject_property ?? r.asset;
  const p = typeof propertyRaw === "string" ? {} : obj(propertyRaw);
  const mRaw = obj(r.metrics ?? r.financials ?? r.key_metrics);
  const s = obj(r.summary ?? r.risk_summary);
  const t = obj(r.deal_terms ?? r.terms);
  const mk = obj(r.market ?? r.market_research);
  const n = obj(r.narrative ?? r.investment_summary ?? r.memo);
  const meta = obj(r.extraction_meta ?? r.extraction);

  const { name, address } = parseNameAddress(
    str(
      (typeof propertyRaw === "string" ? propertyRaw : null) ??
        p.name ??
        p.property_name ??
        r.property_name ??
        r.name,
      "Screened Deal",
    ),
    str(
      p.address ??
        p.property_address ??
        p.street_address ??
        r.property_address ??
        r.address,
    ),
  );

  const metrics: DealMetrics = {
    noi: metric(mRaw.noi),
    cap_rate: metric(mRaw.cap_rate),
    dscr: metric(mRaw.dscr),
    irr: metric(mRaw.irr),
    price_per_unit: metric(mRaw.price_per_unit),
    ltv: metric(mRaw.ltv),
    debt_yield: metric(mRaw.debt_yield),
    expense_ratio: metric(mRaw.expense_ratio),
    breakeven_occupancy: metric(mRaw.breakeven_occupancy),
    occupancy: metric(mRaw.occupancy),
    rent_to_income: metric(mRaw.rent_to_income),
  };

  const flags = arr<Record<string, unknown>>(r.flags ?? r.risk_flags).map((f, i) => ({
    id: str(f.id, `flag-${i}`),
    rule: str(f.rule ?? f.name, "Risk"),
    severity: severity(f.severity),
    reason: str(f.reason ?? f.detail),
    observed: f.observed == null ? null : str(f.observed),
    threshold: str(f.threshold),
  }));

  const counted = (sev: Severity) => flags.filter((f) => f.severity === sev).length;

  return {
    id: slugify(name),
    property: {
      name,
      address,
      units: num(p.units) ?? num(mRaw.units) ?? metric(mRaw.units).value ?? 0,
      year_built: num(p.year_built) ?? num(mRaw.year_built) ?? metric(mRaw.year_built).value,
      submarket: str(p.submarket ?? p.market, "—"),
    },
    screened_on: str(r.screened_on, new Date().toISOString().slice(0, 10)),
    metrics,
    flags,
    summary: {
      critical: num(s.critical) ?? counted("CRITICAL"),
      high: num(s.high) ?? counted("HIGH"),
      unknown: num(s.unknown) ?? counted("UNKNOWN"),
      risk_score: num(s.risk_score) ?? 0,
      recommendation: recommendation(s.recommendation ?? r.recommendation),
      rationale: str(s.rationale),
    },
    deal_terms: {
      purchase_price_source: t.purchase_price_source == null ? null : str(t.purchase_price_source),
      debt_source: t.debt_source == null ? null : str(t.debt_source),
      offering_type: str(t.offering_type, "Not stated"),
      note: str(t.note),
      stated_price: num(t.stated_price ?? r.purchase_price),
      stated_price_page: num(t.stated_price_page) ?? undefined,
    },
    bid_sensitivity: arr<Record<string, unknown>>(r.bid_sensitivity).map((b) => ({
      bid_price: num(b.bid_price) ?? 0,
      price_per_unit: num(b.price_per_unit) ?? 0,
      cap_rate: num(b.cap_rate),
      dscr: num(b.dscr),
      debt_yield: num(b.debt_yield),
      financeable: Boolean(b.financeable),
      negative_leverage: Boolean(b.negative_leverage),
      note: b.note == null ? undefined : str(b.note),
    })),
    max_supportable_price: num(r.max_supportable_price) ?? 0,
    market: {
      comps: arr<Record<string, unknown>>(mk.comps ?? mk.rent_comps).map((c) => ({
        property: str(c.property ?? c.name),
        units: num(c.units) ?? 0,
        year_built: num(c.year_built) ?? 0,
        avg_rent: num(c.avg_rent ?? c.rent) ?? 0,
        occupancy: num(c.occupancy) ?? 0,
        distance: num(c.distance) ?? 0,
      })),
      supply: arr<Record<string, unknown>>(mk.supply ?? mk.deliveries).map((d) => ({
        year: str(d.year),
        deliveries: num(d.deliveries) ?? 0,
        stock_pct: num(d.stock_pct) ?? 0,
      })),
    },
    narrative: {
      headline: str(n.headline, `${name} screening result`),
      executive_summary: str(n.executive_summary ?? n.summary),
      key_strengths: arr<unknown>(n.key_strengths ?? n.strengths)
        .map((v) => str(v))
        .filter(Boolean),
      key_concerns: arr<unknown>(n.key_concerns ?? n.concerns)
        .map((v) => str(v))
        .filter(Boolean),
      critical_questions: arr<unknown>(n.critical_questions ?? n.questions)
        .map((v) => str(v))
        .filter(Boolean),
      recommended_next_steps: arr<unknown>(n.recommended_next_steps ?? n.next_steps)
        .map((v) => str(v))
        .filter(Boolean),
    },
    extraction_meta: {
      source_pages: countPages(meta.source_pages),
      confidence: avgConfidence(meta.confidence),
      missing_fields: arr<unknown>(meta.missing_fields).map((v) => str(v)),
      analyst_notes: str(meta.analyst_notes),
    },
  };
}

function readStore(): Record<string, Deal> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Deal>;
  } catch {
    return {};
  }
}

export function saveScreeningResult(deal: Deal): Deal {
  memory.set(deal.id, deal);
  if (typeof window !== "undefined") {
    try {
      const store = readStore();
      store[deal.id] = deal;
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* sessionStorage unavailable — in-memory copy still works */
    }
  }
  return deal;
}

export function getScreeningResult(id: string): Deal | undefined {
  return memory.get(id) ?? readStore()[id];
}

export function listScreeningResults(): Deal[] {
  return Object.values(readStore());
}
