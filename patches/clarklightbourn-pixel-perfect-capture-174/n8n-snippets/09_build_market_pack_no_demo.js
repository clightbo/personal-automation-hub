// Paste into: Build Market Pack — REPLACE THE WHOLE NODE
// - Removes Gramercy / East-22nd hardcoded comps + fake income
// - Scrapes pipeline % / units vs stock from OM text
// - Prefers LLM rent_comps / supply_deliveries when present
// - Leaves honest empty comps + note when OM has no market table

const input = $input.first().json;
const extracted = input.extracted || {};
const incoming = input.market && typeof input.market === "object" ? { ...input.market } : {};

function readText() {
  let best = "";
  const names = [
    "Trim For Context Window",
    "Trim for Context Window",
    "Extract PDF Text",
    "Extract from File",
    "Extract PDF",
    "Parse Extraction",
  ];
  for (const name of names) {
    try {
      const j = $(name).first().json || {};
      for (const c of [j.om_text, j.text, j.data, j.content, j.trimmed_text]) {
        const t = String(c || "");
        if (t.length > best.length) best = t;
      }
    } catch (e) {}
  }
  if (typeof input.om_text === "string" && input.om_text.length > best.length) best = input.om_text;
  return best;
}

const toN = (s) => {
  if (s == null || s === "") return null;
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const round1 = (n) => Math.round(n * 10) / 10;

function scrapePipeline(src) {
  let pipelineUnits = null;
  let stockUnits = null;
  let pct = toN(incoming.pipeline_pct_of_stock);
  let note = incoming.note || null;

  const pctMatch =
    src.match(
      /pipeline[^\n%]{0,80}?(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:submarket\s+)?(?:stock|inventory)/i,
    ) ||
    src.match(
      /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:submarket\s+)?(?:stock|inventory)[^\n.]{0,40}pipeline/i,
    ) ||
    src.match(
      /(\d{1,2}(?:\.\d+)?)\s*%\s*of\s+(?:the\s+)?(?:submarket|CBD|market)\b/i,
    );
  if (pct == null && pctMatch) {
    pct = Number(pctMatch[1]);
    note = `OM stated pipeline ~${pct}% of stock`;
  }

  const vsPatterns = [
    /\(?\s*([\d,]+)\s+pipeline\s+units?[^\d\n]{0,100}?vs\.?\s+([\d,]+)/i,
    /([\d,]+)\s+pipeline\s+units?\s+in\s+[A-Za-z .'/-]+?\s+vs\.?\s+([\d,]+)/i,
    /([\d,]+)\s*units?\s+(?:of\s+)?(?:new\s+)?(?:supply|pipeline|deliveries)[^\d\n]{0,100}?(?:vs\.?|versus|compared\s+to|against)\s*([\d,]+)/i,
    /([\d,]+)\s*units?[^\d\n]{0,40}?(?:vs\.?|versus)\s*([\d,]+)\s*(?:units?)?[^\n.]{0,40}?(?:CBD|submarket|inventory|stock)/i,
    /\(?\s*([\d,]+)\s*units?\s+(?:vs\.?|versus|against|compared to)\s+([\d,]+)/i,
  ];
  for (const re of vsPatterns) {
    const m = src.match(re);
    if (m) {
      const a = toN(m[1]);
      const b = toN(m[2]);
      if (a != null && b != null && b > a) {
        pipelineUnits = a;
        stockUnits = b;
        break;
      }
    }
  }
  if (pipelineUnits == null) {
    const pOnly =
      src.match(/(?:limited\s+)?pipeline(?:\s+supply)?[^\n\d]{0,40}([\d,]+)\s*units?/i) ||
      src.match(/([\d,]+)\s*units?\s+(?:in\s+)?(?:the\s+)?(?:near[- ]term\s+)?pipeline/i) ||
      src.match(/([\d,]+)\s*units?\s+under\s+construction/i) ||
      src.match(/([\d,]+)\s*units?\s+of\s+(?:new\s+)?(?:supply|deliveries)/i);
    if (pOnly) pipelineUnits = toN(pOnly[1]);
  }
  if (stockUnits == null) {
    const sOnly =
      src.match(
        /([\d,]+)\s*units?\s+(?:of\s+)?(?:existing\s+)?(?:submarket\s+|CBD\s+|Cherry Creek\s+)?(?:inventory|stock)/i,
      ) ||
      src.match(/(?:inventory|stock)\s+of\s+([\d,]+)\s*units?/i) ||
      src.match(
        /(?:submarket|CBD|market)\s+(?:inventory|stock|supply)\s*(?:of|:)?\s*([\d,]+)/i,
      ) ||
      src.match(/([\d,]+)\s*[-–]?\s*unit\s+(?:submarket|inventory|stock|CBD)/i) ||
      src.match(
        /(?:existing|current)\s+(?:inventory|stock|supply)\s*(?:of|:)?\s*([\d,]+)/i,
      );
    if (sOnly) stockUnits = toN(sOnly[1]);
  }

  pipelineUnits =
    pipelineUnits ??
    toN(extracted.pipeline_units ?? extracted.pipeline ?? incoming.pipeline_units);
  stockUnits =
    stockUnits ??
    toN(
      extracted.submarket_stock_units ??
        extracted.stock_units ??
        extracted.submarket_stock ??
        incoming.stock_units,
    );
  if (pct == null) pct = toN(extracted.pipeline_pct_of_stock);

  // Steele Creek-style: LLM got pipeline_units (e.g. 1,127) but not stock —
  // hunt for a larger unit count near that figure / near "pipeline".
  if (stockUnits == null && pipelineUnits != null) {
    const variants = [pipelineUnits.toLocaleString("en-US"), String(pipelineUnits)];
    for (const v of variants) {
      const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const near =
        src.match(
          new RegExp(
            esc +
              String.raw`\s*(?:pipeline\s+)?units?[^\d]{0,120}?(?:vs\.?|versus|compared\s+to|against)\s*([\d,]+)`,
            "i",
          ),
        ) ||
        src.match(
          new RegExp(
            String.raw`(?:vs\.?|versus|compared\s+to|against)\s*([\d,]+)[^\d]{0,80}?` +
              esc,
            "i",
          ),
        );
      if (near) {
        const cand = toN(near[1]);
        if (cand != null && cand > pipelineUnits * 2) {
          stockUnits = cand;
          break;
        }
      }
    }
  }
  if (stockUnits == null && pipelineUnits != null) {
    const idx = src.search(/pipeline|new\s+supply|under\s+construction|deliveries/i);
    if (idx >= 0) {
      const window = src.slice(Math.max(0, idx - 250), idx + 450);
      const nums = [...window.matchAll(/([\d,]{3,6})\s*units?/gi)]
        .map((m) => toN(m[1]))
        .filter((n) => n != null && n > pipelineUnits * 2 && n < 500000);
      if (nums.length) {
        // Prefer the smallest plausible stock (avoid metro-wide totals when both exist)
        stockUnits = Math.min(...nums);
      }
    }
  }

  if (pct == null && pipelineUnits != null && stockUnits != null && stockUnits > 0) {
    pct = round1((pipelineUnits / stockUnits) * 100);
    note = `OM pipeline ${pipelineUnits.toLocaleString()} vs ${stockUnits.toLocaleString()} stock (${pct}%)`;
  }
  // Only score qualitative "limited pipeline" as 0% when we have no unit counts.
  if (
    pct == null &&
    pipelineUnits == null &&
    /limited\s+pipeline|minimal\s+pipeline|negligible\s+new\s+supply|no\s+(?:near[- ]term\s+)?pipeline/i.test(
      src,
    )
  ) {
    pct = 0;
    note = "OM describes limited/minimal pipeline (scored as 0%)";
  }

  return { pipelineUnits, stockUnits, pct, note };
}

function normComps(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({
      property: String(c.property ?? c.name ?? "").trim(),
      units: toN(c.units) ?? 0,
      year_built: toN(c.year_built) ?? 0,
      avg_rent: toN(c.avg_rent ?? c.rent) ?? 0,
      occupancy: toN(c.occupancy) ?? 0,
      distance: toN(c.distance ?? c.distance_miles) ?? 0,
    }))
    .filter((c) => c.property);
}

function normSupply(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((d) => ({
      year: String(d.year ?? "").trim() || "Pipeline",
      deliveries: toN(d.deliveries) ?? 0,
      stock_pct: toN(d.stock_pct ?? d.pct_of_stock) ?? 0,
    }))
    .filter((d) => d.year);
}

const blob = [
  readText(),
  extracted.property_name,
  extracted.address,
  extracted.submarket,
  extracted.city,
  JSON.stringify(extracted.analyst_notes || []),
  JSON.stringify(extracted),
].filter(Boolean).join("\n");

const scraped = scrapePipeline(blob);

let comps = normComps(
  incoming.comps?.length
    ? incoming.comps
    : extracted.rent_comps || extracted.comps || incoming.rent_comps,
);
let supply = normSupply(
  incoming.supply?.length
    ? incoming.supply
    : extracted.supply_deliveries || extracted.supply || incoming.supply_deliveries,
);

const pct = scraped.pct;
if (pct != null && supply.length === 0) {
  supply = [
    {
      year: "Pipeline",
      deliveries: scraped.pipelineUnits != null ? scraped.pipelineUnits : 0,
      stock_pct: pct,
    },
  ];
}

const market = {
  pipeline_pct_of_stock: pct,
  pipeline_units: scraped.pipelineUnits,
  stock_units: scraped.stockUnits,
  submarket_rent_growth:
    toN(incoming.submarket_rent_growth ?? extracted.submarket_rent_growth) ?? null,
  concessions_rising: incoming.concessions_rising === true,
  deferred_maintenance_pct: toN(incoming.deferred_maintenance_pct) ?? null,
  avg_household_income:
    toN(extracted.submarket_median_income ?? incoming.avg_household_income) ?? null,
  comps,
  supply,
  source:
    comps.length || pct != null
      ? scraped.note
        ? "om_text_pipeline_scrape"
        : "extracted_or_incoming"
      : "empty",
  note:
    scraped.note ||
    (comps.length
      ? "Comps from OM extraction"
      : "No rent comps or supply table found in OM — Market Research left empty (not demo data)."),
};

return [{ json: { ...input, market } }];
