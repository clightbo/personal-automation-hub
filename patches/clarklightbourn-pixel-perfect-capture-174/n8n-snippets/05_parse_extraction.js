// Paste into: Parse Extraction (Code node)
// Replaces the whole node. Repairs common free-LLM JSON breakage.

function stripFences(s) {
  s = String(s ?? '').trim();
  s = s.replace(/^```(?:json|javascript|js)?\s*/i, '');
  s = s.replace(/\s*```$/i, '');
  return s.trim();
}

function sliceObject(s) {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return s;
  return s.slice(start, end + 1);
}

function stripComments(s) {
  // Remove // line comments and /* block comments */ outside strings (best-effort)
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

function fixSmartQuotes(s) {
  return s
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

function stripTrailingCommas(s) {
  // , }  or  , ]  →  } / ]
  return s.replace(/,\s*([}\]])/g, '$1');
}

function balanceBraces(s) {
  // If model truncated mid-object, close open { and [
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
    else if (c === '}' || c === ']') {
      if (stack.length && stack[stack.length - 1] === c) stack.pop();
    }
  }
  // Drop dangling incomplete key/value after last comma if truncated mid-value
  let trimmed = s.replace(/,\s*("[^"]*"\s*:)?\s*$/, '');
  // If still ends with open string, close it
  if (inStr) trimmed += quote;
  while (stack.length) trimmed += stack.pop();
  return trimmed;
}

function tryParse(label, s) {
  try {
    return { ok: true, value: JSON.parse(s), label };
  } catch (e) {
    return { ok: false, error: e, label, sample: s };
  }
}

const item = $input.first().json;
const content =
  item?.choices?.[0]?.message?.content ??
  item?.message?.content ??
  item?.content ??
  item?.text ??
  '';

let raw = stripFences(content);
raw = fixSmartQuotes(raw);
raw = sliceObject(raw);
raw = stripComments(raw);
raw = stripTrailingCommas(raw);

let attempt = tryParse('clean', raw);

if (!attempt.ok) {
  const balanced = stripTrailingCommas(balanceBraces(raw));
  attempt = tryParse('balanced', balanced);
}

if (!attempt.ok) {
  // Last resort: remove control chars except \n \t
  const scrubbed = stripTrailingCommas(
    balanceBraces(raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''))
  );
  attempt = tryParse('scrubbed', scrubbed);
}

if (!attempt.ok) {
  const snippet = String(raw).slice(Math.max(0, 1180), 1280);
  throw new Error(
    'Parse Extraction: LLM returned invalid JSON. ' +
      'Near pos 1213: ' + JSON.stringify(snippet) +
      ' | Original: ' + (attempt.error?.message || 'parse failed') +
      ' | Tip: re-run, or tighten Extract prompt to "valid JSON only, no trailing commas, no markdown".'
  );
}

const extracted = attempt.value;

// Pass through settings + extracted fields for Enrich / Valid OM / Metrics
return [{
  json: {
    ...item,
    ...extracted,
    extracted,
    _parse_method: attempt.label,
  },
}];
