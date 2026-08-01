// Paste into: Assemble Response — REPLACE THE WHOLE NODE
// No Memo LLM required. Builds narrative from Metrics flags.
// Guarantees a stated address string + passes market (comps/supply/pipeline).

let engine;
for (const n of [
  "Metrics + Risk Rules Engine",
  "Metrics + Risk Rules Engine1",
  "Metrics",
  "Metrics + Risk",
]) {
  try {
    engine = $(n).first().json;
    if (engine) break;
  } catch (e) {}
}
if (!engine) engine = $input.first().json || {};

const extracted = engine.extracted || {};
const market =
  engine.market && typeof engine.market === "object"
    ? engine.market
    : $input.first().json?.market && typeof $input.first().json.market === "object"
      ? $input.first().json.market
      : {};

function str(v, fallback = "") {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

const propIn =
  engine.property && typeof engine.property === "object"
    ? engine.property
    : {
        name:
          typeof engine.property === "string"
            ? engine.property
            : engine.property_name || extracted.property_name,
        address: engine.address || extracted.address || extracted.full_address,
        city: engine.city || extracted.city,
        state: engine.state || extracted.state,
        submarket: engine.submarket || extracted.submarket,
        units: engine.units || extracted.units,
        year_built: engine.year_built || extracted.year_built,
        zip: engine.zip || extracted.zip,
      };

const street = str(propIn.address || extracted.full_address || extracted.address);
const cityState = [str(propIn.city || extracted.city), str(propIn.state || extracted.state)]
  .filter(Boolean)
  .join(", ");
const zip = str(propIn.zip || extracted.zip);
const submarket = str(propIn.submarket || extracted.submarket || engine.submarket);
const address =
  street ||
  (cityState ? `${cityState}${zip ? ` ${zip}` : ""}` : "") ||
  submarket ||
  "Address not stated in OM";

const name =
  str(propIn.name || propIn.property_name || extracted.property_name || engine.property) ||
  "Screened Deal";

const property = {
  name,
  property_name: name,
  address,
  city: str(propIn.city || extracted.city) || null,
  state: str(propIn.state || extracted.state) || null,
  zip: zip || null,
  submarket: submarket || "—",
  units: propIn.units ?? extracted.units ?? null,
  year_built: propIn.year_built ?? extracted.year_built ?? null,
};

const flags = Array.isArray(engine.flags) ? engine.flags : [];
const summary = engine.summary || {};
const pass = flags.filter((f) => String(f.severity).toUpperCase() === "PASS");
const bad = flags.filter((f) =>
  ["CRITICAL", "HIGH"].includes(String(f.severity).toUpperCase()),
);
const unk = flags.filter((f) => String(f.severity).toUpperCase() === "UNKNOWN");

const m = engine.metrics || {};
const strengths = [];
if (pass.length) strengths.push(...pass.slice(0, 4).map((f) => `${f.rule}: ${f.reason || "PASS"}`));
if (m.noi != null) strengths.push(`In-place NOI ${m.noi}`);
if (m.occupancy != null) strengths.push(`Occupancy ${m.occupancy}%`);
if (!strengths.length) strengths.push("Core metrics extracted from the OM");

const concerns = bad.length
  ? bad.map((f) => `${f.rule} (${f.severity}): ${f.reason || ""}`.trim())
  : ["No HIGH/CRITICAL flags from the rule engine"];

const questions = unk.map((f) => `Resolve ${f.rule}: ${f.reason || "data missing from OM"}`);
if (market.source === "empty") {
  questions.push("OM market pages: confirm rent comps and near-term pipeline % of stock");
}
if (address === "Address not stated in OM") {
  questions.push("Confirm property street address / city / state for the IC memo");
}

const next = [];
if (bad.some((f) => /capital|capex/i.test(f.rule))) next.push("Order PCA / review capex budget");
if (bad.some((f) => /dscr|debt/i.test(f.rule))) next.push("Stress debt terms and bid ladder");
if (market.pipeline_pct_of_stock != null) {
  next.push(`Underwrite supply at ${market.pipeline_pct_of_stock}% of submarket stock`);
} else {
  next.push("Pull CoStar/Axio pipeline for Competitive Supply (not in OM)");
}
if (!next.length) next.push("Complete broker Q&A on missing fields");

const narrative = {
  headline: `${summary.recommendation || "SCREEN"} — ${name}`,
  executive_summary:
    summary.rationale ||
    `Screened ${name} at ${address}. Risk score ${summary.risk_score ?? "n/a"}/100.`,
  key_strengths: strengths.slice(0, 6),
  key_concerns: concerns.slice(0, 6),
  critical_questions: questions.slice(0, 6),
  recommended_next_steps: next.slice(0, 6),
};

// Keep Competitive Supply visible in market even if only pipeline % exists
const supply =
  Array.isArray(market.supply) && market.supply.length
    ? market.supply
    : market.pipeline_pct_of_stock != null
      ? [
          {
            year: "Pipeline",
            deliveries: market.pipeline_units ?? 0,
            stock_pct: market.pipeline_pct_of_stock,
          },
        ]
      : [];

return [
  {
    json: {
      ...engine,
      property,
      address: property.address,
      city: property.city,
      state: property.state,
      submarket: property.submarket,
      units: property.units,
      year_built: property.year_built,
      market: {
        ...market,
        comps: Array.isArray(market.comps) ? market.comps : [],
        supply,
      },
      narrative,
      status: "complete",
    },
  },
];
