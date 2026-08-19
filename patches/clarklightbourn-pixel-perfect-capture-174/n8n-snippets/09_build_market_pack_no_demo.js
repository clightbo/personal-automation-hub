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
    "Trim For Context",
    "Trim",
    "Extract PDF Text",
    "Extract from File",
    "Extract PDF",
    "PDF Extract",
    "Parse Extraction",
    "Enrich",
    "Enrich Extraction",
    "Build Extract Request",
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
  if (typeof input.om_text === "string" && input.om_text.length > best.length) {
    best = input.om_text;
  }
  if (typeof extracted.om_text === "string" && extracted.om_text.length > best.length) {
    best = extracted.om_text;
  }
  return best;
}

const toN = (s) => {
  if (s == null || s === "") return null;
  const n = Number(String(s).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const round1 = (n) => Math.round(n * 10) / 10;

/** Flatten whitespace so "1,127 units\\nvs\\n19,382" still matches. */
function flat(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ");
}

function scrapePipeline(src) {
  const debug = { text_chars: String(src || "").length, hits: [] };
  let pipelineUnits = null;
  let stockUnits = null;
  let pct = toN(incoming.pipeline_pct_of_stock);
  let note = incoming.note || null;
  const plain = flat(src);

  const pctMatch =
    plain.match(
      /pipeline[^%]{0,100}?(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:the\s+)?(?:submarket\s+|CBD\s+|Cherry Creek\s+)?(?:stock|inventory|supply|market)/i,
    ) ||
    plain.match(
      /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:the\s+)?(?:submarket\s+|CBD\s+)?(?:stock|inventory)[^.]{0,60}pipeline/i,
    ) ||
    plain.match(/representing\s+(\d{1,2}(?:\.\d+)?)\s*%/i) ||
    plain.match(/(\d{1,2}(?:\.\d+)?)\s*%\s*of\s+(?:the\s+)?(?:submarket|CBD|market|inventory|stock)\b/i);
  if (pct == null && pctMatch) {
    pct = Number(pctMatch[1]);
    note = `OM stated pipeline ~${pct}% of stock`;
    debug.hits.push("pct_literal");
  }

  const vsPatterns = [
    /\(?\s*([\d,]+)\s+pipeline\s+units?[^0-9]{0,120}?vs\.?\s*([\d,]+)/i,
    /([\d,]+)\s+pipeline\s+units?\s+in\s+[A-Za-z .'/-]+?\s+vs\.?\s*([\d,]+)/i,
    /([\d,]+)\s*units?\s+(?:of\s+)?(?:new\s+)?(?:supply|pipeline|deliveries)[^0-9]{0,120}?(?:vs\.?|versus|compared\s+to|against)\s*([\d,]+)/i,
    /([\d,]+)\s*units?[^0-9]{0,60}?(?:vs\.?|versus)\s*([\d,]+)\s*(?:units?)?[^.]{0,60}?(?:CBD|submarket|inventory|stock|Cherry Creek)/i,
    /\(?\s*([\d,]+)\s*units?\s+(?:vs\.?|versus|against|compared to)\s+([\d,]+)/i,
    /([\d,]+)\s*\/\s*([\d,]+)\s*(?:units?)?/i,
    /([\d,]+)\s+of\s+([\d,]+)\s*(?:units?)?/i,
  ];
  for (const re of vsPatterns) {
    const m = plain.match(re);
    if (m) {
      const a = toN(m[1]);
      const b = toN(m[2]);
      if (a != null && b != null && b > a * 2) {
        pipelineUnits = a;
        stockUnits = b;
        debug.hits.push("vs_pair");
        break;
      }
    }
  }
  if (pipelineUnits == null) {
    const pOnly =
      plain.match(/(?:limited\s+)?pipeline(?:\s+supply)?[^0-9]{0,40}([\d,]+)\s*units?/i) ||
      plain.match(/([\d,]+)\s*units?\s+(?:in\s+)?(?:the\s+)?(?:near[- ]term\s+)?pipeline/i) ||
      plain.match(/([\d,]+)\s*units?\s+under\s+construction/i) ||
      plain.match(/([\d,]+)\s*units?\s+of\s+(?:new\s+)?(?:supply|deliveries)/i) ||
      plain.match(/new\s+supply[^0-9]{0,40}([\d,]+)\s*units?/i);
    if (pOnly) {
      pipelineUnits = toN(pOnly[1]);
      debug.hits.push("pipeline_only");
    }
  }
  if (stockUnits == null) {
    const sOnly =
      plain.match(
        /([\d,]+)\s*units?\s+(?:of\s+)?(?:existing\s+)?(?:submarket\s+|CBD\s+|Cherry Creek\s+)?(?:inventory|stock)/i,
      ) ||
      plain.match(/(?:inventory|stock)\s+of\s+([\d,]+)\s*units?/i) ||
      plain.match(
        /(?:submarket|CBD|market|Cherry Creek)\s+(?:inventory|stock|supply)\s*(?:of|:)?\s*([\d,]+)/i,
      ) ||
      plain.match(/([\d,]+)\s*[-–]?\s*unit\s+(?:submarket|inventory|stock|CBD)/i) ||
      plain.match(
        /(?:existing|current)\s+(?:inventory|stock|supply)\s*(?:of|:)?\s*([\d,]+)/i,
      ) ||
      plain.match(/([\d,]+)\s*(?:unit\s+)?(?:multifamily\s+)?(?:inventory|stock)\b/i);
    if (sOnly) {
      stockUnits = toN(sOnly[1]);
      debug.hits.push("stock_only");
    }
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
  if (pipelineUnits != null) debug.pipeline_from_llm_or_text = pipelineUnits;

  // Hunt stock near the known pipeline figure (covers split lines / tables).
  if (stockUnits == null && pipelineUnits != null) {
    const forms = [
      pipelineUnits.toLocaleString("en-US"),
      String(pipelineUnits),
    ];
    const candidates = [];
    for (const form of forms) {
      const esc = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(esc, "gi");
      let m;
      while ((m = re.exec(plain)) !== null) {
        const window = plain.slice(
          Math.max(0, m.index - 500),
          Math.min(plain.length, m.index + form.length + 500),
        );
        for (const nm of window.matchAll(/([\d,]{4,7})/g)) {
          const n = toN(nm[1]);
          if (n != null && n > pipelineUnits * 3 && n < Math.min(200000, pipelineUnits * 40)) {
            candidates.push(n);
          }
        }
      }
    }
    for (const m of plain.matchAll(
      /(?:inventory|stock|existing units?|unit inventory|multifamily units?)[^0-9]{0,48}([\d,]{4,7})/gi,
    )) {
      const n = toN(m[1]);
      if (n != null && n > pipelineUnits * 3 && n < 200000) candidates.push(n);
    }
    for (const m of plain.matchAll(
      /([\d,]{4,7})[^0-9]{0,48}(?:unit\s+)?(?:inventory|stock|existing)/gi,
    )) {
      const n = toN(m[1]);
      if (n != null && n > pipelineUnits * 3 && n < 200000) candidates.push(n);
    }
    // Prefer stock that implies pipeline is ~2–25% of inventory (typical).
    const scored = [...new Set(candidates)].map((s) => ({
      s,
      ratio: pipelineUnits / s,
    }));
    const inRange = scored.filter((x) => x.ratio >= 0.02 && x.ratio <= 0.25);
    const pool = (inRange.length ? inRange : scored).sort((a, b) => a.s - b.s);
    if (pool.length) {
      stockUnits = pool[0].s;
      debug.hits.push("stock_near_pipeline");
      debug.stock_candidates = pool.slice(0, 5).map((x) => x.s);
    }
  }

  // Last resort: bare large inventory figure present anywhere with known pipeline.
  if (stockUnits == null && pipelineUnits != null) {
    const bare = [...plain.matchAll(/\b(19[\d,]{3,5}|1[0-9][\d,]{3,5}|[2-9][\d,]{4,6})\b/g)]
      .map((m) => toN(m[1]))
      .filter(
        (n) =>
          n != null &&
          n > pipelineUnits * 4 &&
          n < Math.min(150000, pipelineUnits * 30) &&
          pipelineUnits / n >= 0.03 &&
          pipelineUnits / n <= 0.2,
      );
    if (bare.length) {
      stockUnits = Math.min(...bare);
      debug.hits.push("bare_inventory_candidate");
    }
  }

  if (pct == null && pipelineUnits != null && stockUnits != null && stockUnits > 0) {
    pct = round1((pipelineUnits / stockUnits) * 100);
    note = `OM pipeline ${pipelineUnits.toLocaleString()} vs ${stockUnits.toLocaleString()} stock (${pct}%)`;
  }
  if (
    pct == null &&
    pipelineUnits == null &&
    /limited\s+pipeline|minimal\s+pipeline|negligible\s+new\s+supply|no\s+(?:near[- ]term\s+)?pipeline/i.test(
      plain,
    )
  ) {
    pct = 0;
    note = "OM describes limited/minimal pipeline (scored as 0%)";
    debug.hits.push("qualitative_zero");
  }

  debug.pipelineUnits = pipelineUnits;
  debug.stockUnits = stockUnits;
  debug.pct = pct;
  return { pipelineUnits, stockUnits, pct, note, debug };
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
  _supply_debug: scraped.debug,
};

return [{ json: { ...input, market, om_text: readText() || input.om_text } }];
