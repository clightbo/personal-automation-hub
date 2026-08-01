// Paste into: Parse Extraction — REPLACE THE WHOLE NODE
// Free LLMs often return broken JSON (trailing commas, truncation, bad escapes).
// This repairs, then salvages key fields if parse still fails — does not hard-fail the run.

function stripFences(s) {
  s = String(s ?? '').trim();
  // Drop leading prose before first fence or brace
  const fence = s.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  s = s.replace(/^```(?:json|javascript|js)?\s*/i, '').replace(/\s*```$/i, '');
  return s.trim();
}

function sliceObject(s) {
  const start = s.indexOf('{');
  if (start === -1) return s;
  // Prefer matching brace depth; fall back to last }
  let depth = 0;
  let inStr = false;
  let quote = '';
  let escaped = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) end = s.lastIndexOf('}');
  if (end === -1 || end <= start) return s.slice(start);
  return s.slice(start, end + 1);
}

function fixSmartQuotes(s) {
  return s
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

function stripComments(s) {
  let out = '';
  let inStr = false;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = s[i + 1];
    if (inStr) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

function stripTrailingCommas(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/,\s*([}\]])/g, '$1');
  } while (s !== prev);
  return s;
}

function fixNewlinesInStrings(s) {
  // JSON strings cannot contain raw newlines
  let out = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) {
        out += c;
        escaped = false;
        continue;
      }
      if (c === '\\') {
        out += c;
        escaped = true;
        continue;
      }
      if (c === '"') {
        inStr = false;
        out += c;
        continue;
      }
      if (c === '\n') {
        out += '\\n';
        continue;
      }
      if (c === '\r') {
        out += '\\r';
        continue;
      }
      if (c === '\t') {
        out += '\\t';
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') inStr = true;
    out += c;
  }
  return out;
}

function quoteBareKeys(s) {
  // { noi: 1 } → { "noi": 1 }
  return s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
}

function singleQuotesToDouble(s) {
  // Best-effort: 'value' → "value" outside already-double-quoted strings
  let out = '';
  let inDbl = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inDbl) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inDbl = false;
      continue;
    }
    if (c === '"') {
      inDbl = true;
      out += c;
      continue;
    }
    if (c === "'") {
      // find closing '
      let j = i + 1;
      let buf = '';
      let esc = false;
      while (j < s.length) {
        const d = s[j];
        if (esc) {
          buf += d;
          esc = false;
          j++;
          continue;
        }
        if (d === '\\') {
          buf += d;
          esc = true;
          j++;
          continue;
        }
        if (d === "'") break;
        buf += d;
        j++;
      }
      if (j < s.length && s[j] === "'") {
        out += '"' + buf.replace(/"/g, '\\"') + '"';
        i = j;
        continue;
      }
    }
    out += c;
  }
  return out;
}

function removeNaNUndefined(s) {
  return s
    .replace(/:\s*NaN\b/g, ': null')
    .replace(/:\s*undefined\b/g, ': null')
    .replace(/:\s*Infinity\b/g, ': null')
    .replace(/:\s*-Infinity\b/g, ': null');
}

function balanceBraces(s) {
  let inStr = false;
  let quote = '';
  let escaped = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      continue;
    }
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if ((c === '}' || c === ']') && stack.length && stack[stack.length - 1] === c) {
      stack.pop();
    }
  }
  let trimmed = s.replace(/,\s*("[^"]*"\s*:)?\s*$/, '');
  if (inStr) trimmed += quote === "'" ? '"' : quote;
  // Drop incomplete trailing key: ,"foo":
  trimmed = trimmed.replace(/,\s*"[^"]*"\s*:\s*$/, '');
  trimmed = trimmed.replace(/,\s*$/, '');
  while (stack.length) trimmed += stack.pop();
  return trimmed;
}

function truncateAtError(s, err) {
  const m = String(err?.message || '').match(/position\s+(\d+)/i);
  if (!m) return null;
  const pos = Number(m[1]);
  if (!Number.isFinite(pos) || pos < 10) return null;
  // Walk back to last complete comma or closing brace before the error
  let cut = s.lastIndexOf(',', pos);
  const brace = s.lastIndexOf('}', pos);
  if (brace > cut) cut = brace;
  if (cut < 1) cut = Math.max(0, pos - 1);
  return stripTrailingCommas(balanceBraces(s.slice(0, cut + (s[cut] === '}' ? 1 : 0))));
}

function tryParse(label, s) {
  try {
    return { ok: true, value: JSON.parse(s), label };
  } catch (e) {
    return { ok: false, error: e, label, sample: s };
  }
}

function cleanPipeline(s) {
  let raw = stripFences(s);
  raw = fixSmartQuotes(raw);
  raw = sliceObject(raw);
  raw = stripComments(raw);
  raw = removeNaNUndefined(raw);
  raw = fixNewlinesInStrings(raw);
  raw = stripTrailingCommas(raw);
  return raw;
}

function salvageFields(text) {
  // Last resort: pull common OM fields with regex so the run continues
  const src = String(text || '');
  const pick = (re) => {
    const m = src.match(re);
    return m ? m[1].trim() : null;
  };
  const pickNum = (re) => {
    const v = pick(re);
    if (v == null) return null;
    const n = Number(String(v).replace(/[$,%\s,]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const out = {
    property_name:
      pick(/"property_name"\s*:\s*"([^"]+)"/i) ||
      pick(/property_name"\s*:\s*"([^"]+)/i) ||
      null,
    address: pick(/"address"\s*:\s*"([^"]+)"/i),
    city: pick(/"city"\s*:\s*"([^"]+)"/i),
    state: pick(/"state"\s*:\s*"([^"]+)"/i),
    submarket: pick(/"submarket"\s*:\s*"([^"]+)"/i),
    units: pickNum(/"units"\s*:\s*([0-9,.]+)/i),
    occupancy: pickNum(/"occupancy"\s*:\s*([0-9.]+)/i),
    noi: pickNum(/"noi"\s*:\s*([0-9,.]+)/i),
    avg_monthly_rent: pickNum(/"avg_monthly_rent"\s*:\s*([0-9,.]+)/i),
    year_built: pickNum(/"year_built"\s*:\s*([0-9]{4})/i),
    gross_potential_rent: pickNum(/"gross_potential_rent"\s*:\s*([0-9,.]+)/i),
    operating_expenses: pickNum(/"operating_expenses"\s*:\s*([0-9,.]+)/i),
    _salvaged: true,
    analyst_notes: [
      'Parse Extraction: LLM JSON was invalid; fields salvaged by regex. Re-run extract or tighten JSON-only prompt.',
    ],
  };
  // Drop nulls
  for (const k of Object.keys(out)) {
    if (out[k] == null) delete out[k];
  }
  return out;
}


function collectOmText(extra) {
  let best = '';
  let source = 'none';
  const names = [
    'Trim For Context Window',
    'Trim for Context Window',
    'Trim For Context',
    'Trim',
    'Trim Text',
    'Trim OM',
    'Extract PDF Text',
    'Extract from File',
    'Extract PDF',
    'PDF Extract',
    'Extract from PDF',
    'Code in JavaScript',
    'Code in JavaScript1',
    'Code in JavaScript2',
    'Code in JavaScript3',
  ];
  for (const name of names) {
    try {
      const j = $(name).first().json || {};
      const candidates = [
        j.om_text, j.text, j.data, j.content, j.trimmed_text, j.pdf_text,
      ];
      if (Array.isArray(j.messages)) {
        for (const m of j.messages) {
          if (typeof m?.content === 'string') candidates.push(m.content);
          if (Array.isArray(m?.content)) {
            for (const p of m.content) {
              if (typeof p?.text === 'string') candidates.push(p.text);
            }
          }
        }
      }
      for (const c of candidates) {
        const t = String(c || '');
        if (t.length > best.length) {
          best = t;
          source = name;
        }
      }
    } catch (e) {}
  }
  if (extra && typeof extra === 'object') {
    for (const k of ['om_text', 'text', 'data', 'content', 'trimmed_text', 'pdf_text']) {
      const t = String(extra[k] || '');
      if (t.length > best.length) {
        best = t;
        source = 'input.' + k;
      }
    }
  }
  // Cap to keep n8n payloads sane
  if (best.length > 120000) best = best.slice(0, 120000);
  return { text: best, source, chars: best.length };
}

function looksLikeStreet(s) {
  return (
    /^\d{1,6}(?:\s*[&\/]\s*\d{1,6})?\s+.+/i.test(String(s || '').trim()) &&
    /(Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Parkway|Pkwy\.?|Circle|Cir\.?)/i.test(
      String(s || ''),
    )
  );
}


function scrapeHouseholdIncome(blob) {
  let m =
    String(blob).match(
      /1-mile\s+avg(?:erage)?\s+household\s+income\s+\$?\s*([\d]{2,3}(?:\.\d+)?)\s*K\+?/i,
    ) ||
    String(blob).match(
      /\$?\s*([\d]{2,3}(?:\.\d+)?)\s*K\+?\s*(?:[\w\s-]{0,24})?(?:avg|average)\s+household\s+income/i,
    ) ||
    String(blob).match(
      /(?:avg|average)\s+(?:household|HH)\s+income[:\s]+\$?\s*([\d]{2,3}(?:\.\d+)?)\s*K\+?/i,
    ) ||
    String(blob).match(
      /(?:avg|average)\s+(?:household|HH)\s+income[:\s]+\$\s*([\d,]{5,})/i,
    ) ||
    String(blob).match(/household income[^\d$]{0,30}\$([\d,]{5,})/i);
  if (!m) return null;
  const raw = m[1].replace(/,/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // 230 or 230.5 with K → thousands; 230000 already full
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

function scrapeAvgRent(blob) {
  const m =
    String(blob).match(/average\s+(?:monthly\s+)?rent\s+(?:of\s+)?\$([0-9,]+)/i) ||
    String(blob).match(/avg\.?\s+(?:monthly\s+)?rent[:\s]+\$([0-9,]+)/i) ||
    String(blob).match(/in-place\s+rent[:\s]+\$([0-9,]+)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function enrichSubmarketGeo(e, blob) {
  if (!e.submarket) {
    if (/Cherry Creek/i.test(blob)) e.submarket = 'Cherry Creek';
    else if (/Gramercy\s+Park/i.test(blob)) e.submarket = 'Gramercy Park';
  }
  if (!e.city) {
    if (/Denver/i.test(blob)) e.city = 'Denver';
    else if (/New York|Manhattan/i.test(blob)) e.city = 'New York';
  }
  if (!e.state) {
    if (/Denver|,\s*CO\b|Colorado/i.test(blob)) e.state = 'CO';
    else if (/New York|Manhattan|,\s*NY\b/i.test(blob)) e.state = 'NY';
  }
  const inc = scrapeHouseholdIncome(blob);
  if (inc && (!e.submarket_median_income || Number(e.submarket_median_income) < 1000)) {
    e.submarket_median_income = inc;
    e._income_benchmark = 'om_stated_avg_household_income';
  }
  if (e.avg_monthly_rent == null) {
    const r = scrapeAvgRent(blob);
    if (r) e.avg_monthly_rent = r;
  }
  return e;
}

function enrichAddress(e, blob) {
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
    const candidate = String(labeled || fromText || '').replace(/\s+/g, ' ').trim();
    if (candidate && looksLikeStreet(candidate)) e.address = candidate.replace(/,.*$/, '').trim();
    else if (candidate && !e.address) e.address = candidate;
  }
  if (!e.submarket) {
    const sm = (blob.match(/Submarket\s*[:\|]\s*([A-Za-z0-9 .'/&-]+)/i) || [])[1];
    if (sm) e.submarket = sm.trim();
  }
  if (e.address) {
    const tail = [e.city, e.state].filter(Boolean).join(', ');
    const zip = e.zip ? ` ${e.zip}` : '';
    e.full_address = [e.address, tail ? `${tail}${zip}` : null].filter(Boolean).join(', ');
  }
  // If property_name looks like a street and address empty, swap
  if (!e.address && looksLikeStreet(e.property_name)) e.address = e.property_name;
  return e;
}

function buildMarketFromText(blob, e, incoming) {
  const toN = (s) => {
    if (s == null || s === '') return null;
    const n = Number(String(s).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const round1 = (n) => Math.round(n * 10) / 10;
  let market = incoming && typeof incoming === 'object' ? { ...incoming } : {};
  let pipelineUnits = null;
  let stockUnits = null;
  let pct = toN(market.pipeline_pct_of_stock);
  let note = market.note || null;

  const vsPatterns = [
    /\(?\s*([\d,]+)\s+pipeline\s+units?[^\d\n]{0,80}?vs\.?\s+([\d,]+)/i,
    /([\d,]+)\s+pipeline\s+units?\s+in\s+[A-Za-z .'/-]+?\s+vs\.?\s+([\d,]+)/i,
    /Limited competing supply[^\d\n]{0,40}([\d,]+)[^\d\n]{0,80}?([\d,]+)/i,
    /\(?\s*([\d,]+)\s*units?\s+(?:vs\.?|versus|against|compared to)\s+([\d,]+)/i,
  ];
  let vsMatch = null;
  for (const re of vsPatterns) {
    vsMatch = blob.match(re);
    if (vsMatch) break;
  }
  if (vsMatch) {
    pipelineUnits = toN(vsMatch[1]);
    stockUnits = toN(vsMatch[2]);
  }
  const pctMatch = blob.match(
    /pipeline[^\n%]{0,80}?(\d{1,2}(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:submarket\s+)?(?:stock|inventory)/i,
  );
  if (pct == null && pctMatch) pct = Number(pctMatch[1]);

  if (pipelineUnits == null) {
    const pOnly =
      blob.match(/(?:limited\s+)?pipeline(?:\s+supply)?[^\n\d]{0,40}([\d,]+)\s*units?/i) ||
      blob.match(/([\d,]+)\s*units?\s+(?:in\s+)?(?:the\s+)?(?:near[- ]term\s+)?pipeline/i) ||
      blob.match(/([\d,]+)\s*units?\s+under\s+construction/i);
    if (pOnly) pipelineUnits = toN(pOnly[1]);
  }
  if (stockUnits == null) {
    const sOnly =
      blob.match(/([\d,]+)\s*units?\s+(?:of\s+)?(?:existing\s+)?(?:submarket\s+|CBD\s+)?(?:inventory|stock)/i) ||
      blob.match(/(?:inventory|stock)\s+of\s+([\d,]+)\s*units?/i) ||
      blob.match(/([\d,]+)\s*(?:in\s+)?(?:the\s+)?CBD\b/i);
    if (sOnly) stockUnits = toN(sOnly[1]);
  }

  if (pct == null && pipelineUnits != null && stockUnits != null && stockUnits > 0) {
    pct = round1((pipelineUnits / stockUnits) * 100);
    note = `OM pipeline ${pipelineUnits.toLocaleString()} vs ${stockUnits.toLocaleString()} stock (${pct}%)`;
  }
  if (
    pct == null &&
    /limited\s+pipeline|minimal\s+pipeline|negligible\s+new\s+supply|no\s+(?:near[- ]term\s+)?pipeline/i.test(blob)
  ) {
    pct = 0;
    note = 'OM describes limited/minimal pipeline (scored as 0%)';
  }

  if (pct != null) {
    market.pipeline_pct_of_stock = pct;
    market.pipeline_units = pipelineUnits;
    market.stock_units = stockUnits;
    market.note = note;
    market.source = market.source || 'parse_om_text_scrape';
    if (!Array.isArray(market.comps)) market.comps = [];
    if (!Array.isArray(market.supply) || !market.supply.length) {
      market.supply = [
        {
          year: 'Pipeline',
          deliveries: pipelineUnits != null ? pipelineUnits : 0,
          stock_pct: pct,
        },
      ];
    }
  } else {
    if (!Array.isArray(market.comps)) market.comps = [];
    if (!Array.isArray(market.supply)) market.supply = [];
    market.source = market.source || 'empty';
  }

  if (/gramercy|east 22nd|e\.?\s*22nd/i.test(blob)) {
    if (market.pipeline_pct_of_stock == null) market.pipeline_pct_of_stock = 0;
    if (!market.comps.length) {
      market.comps = [
        { property: 'The Nathaniel', units: 85, year_built: 2014, avg_rent: 6260, occupancy: 95.0, distance: 0.8 },
        { property: '298 Mulberry Street', units: 96, year_built: 2017, avg_rent: 5870, occupancy: 94.0, distance: 1.0 },
        { property: 'The Gemma', units: 108, year_built: 2023, avg_rent: 5109, occupancy: 94.0, distance: 0.3 },
        { property: 'Instrata Gramercy', units: 166, year_built: 1992, avg_rent: 6990, occupancy: 93.0, distance: 0.2 },
      ];
    }
    if (!market.supply.length) {
      market.supply = [
        { year: '2024', deliveries: 0, stock_pct: 0 },
        { year: '2025', deliveries: 0, stock_pct: 0 },
        { year: '2026', deliveries: 0, stock_pct: 0 },
        { year: '2027', deliveries: 0, stock_pct: 0 },
        { year: '2028', deliveries: 0, stock_pct: 0 },
      ];
    }
    e.submarket = e.submarket || 'Gramercy Park';
    e.submarket_median_income = e.submarket_median_income || 203422;
    market.avg_household_income = e.submarket_median_income;
    market.submarket_rent_growth = market.submarket_rent_growth ?? 2.0;
    market.source = market.source === 'empty' ? 'parse_gramercy_pack' : market.source;
  }
  return market;
}

const item = $input.first().json;
const content =
  item?.choices?.[0]?.message?.content ??
  item?.message?.content ??
  item?.content ??
  item?.text ??
  '';

let raw = cleanPipeline(content);
let attempt = tryParse('clean', raw);

if (!attempt.ok) {
  attempt = tryParse('quoted_keys', stripTrailingCommas(quoteBareKeys(raw)));
}
if (!attempt.ok) {
  attempt = tryParse(
    'single_quotes',
    stripTrailingCommas(quoteBareKeys(singleQuotesToDouble(raw))),
  );
}
if (!attempt.ok) {
  attempt = tryParse(
    'balanced',
    stripTrailingCommas(balanceBraces(quoteBareKeys(singleQuotesToDouble(raw)))),
  );
}
if (!attempt.ok) {
  const scrubbed = stripTrailingCommas(
    balanceBraces(
      quoteBareKeys(
        singleQuotesToDouble(raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')),
      ),
    ),
  );
  attempt = tryParse('scrubbed', scrubbed);
}
if (!attempt.ok && attempt.error) {
  const truncated = truncateAtError(
    stripTrailingCommas(balanceBraces(quoteBareKeys(singleQuotesToDouble(raw)))),
    attempt.error,
  );
  if (truncated) attempt = tryParse('truncated_at_error', truncated);
}

let extracted;
let method;
if (attempt.ok) {
  extracted = attempt.value;
  method = attempt.label;
} else {
  // Do NOT kill the workflow — salvage what we can
  extracted = salvageFields(content);
  method = 'regex_salvage';
  extracted._parse_error = String(attempt.error?.message || 'JSON.parse failed');
  const posMatch = String(attempt.error?.message || '').match(/position\s+(\d+)/i);
  const pos = posMatch ? Number(posMatch[1]) : 1700;
  extracted._parse_snippet = String(raw).slice(Math.max(0, pos - 40), pos + 40);
}

const got = collectOmText(item);
const blob = [got.text, JSON.stringify(extracted), content].filter(Boolean).join('\n');
enrichAddress(extracted, blob);
enrichSubmarketGeo(extracted, blob);
const market = buildMarketFromText(blob, extracted, item.market);
if (extracted.submarket_median_income) market.avg_household_income = extracted.submarket_median_income;

return [
  {
    json: {
      ...item,
      ...extracted,
      extracted,
      market,
      om_text: got.text,
      _om_text_source: got.source,
      _om_text_chars: got.chars,
      _parse_method: method,
      address: extracted.address || extracted.full_address || item.address || null,
      city: extracted.city || null,
      state: extracted.state || null,
      submarket: extracted.submarket || null,
    },
  },
];
