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

return [
  {
    json: {
      ...item,
      ...extracted,
      extracted,
      _parse_method: method,
    },
  },
];
