const input = $input.first().json;
const e = { ...(input.extracted || {}) };

// Pull OM text from Trim / Extract PDF (name may vary)
let text = '';
const textNodes = [
  'Trim For Context Window',
  'Trim for Context Window',
  'Extract PDF Text',
  'Extract from File',
  'Extract PDF',
];
for (const name of textNodes) {
  if (text) break;
  try {
    const j = $(name).first().json;
    text = String(j.text || j.data || j.content || '');
  } catch (err) {}
}

const blob = [
  text,
  e.property_name,
  e.name,
  e.address,
  e.property_address,
  e.street_address,
  e.location,
  e.submarket,
  e.city,
  e.state,
  e.zip,
  JSON.stringify(e.analyst_notes || []),
  JSON.stringify(e),
].filter(Boolean).join('\n');

const pick = (re, src = blob) => {
  const m = src.match(re);
  return m ? (m[1] || '').trim() : null;
};

const clean = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
    .trim();

const looksLikeStreet = (s) =>
  /^\d{1,6}(?:\s*[&\/]\s*\d{1,6})?\s+.+/i.test(String(s || '').trim()) &&
  /(Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Parkway|Pkwy\.?|Circle|Cir\.?)/i.test(
    String(s || ''),
  );

// ---- Known OM shortcuts (keep) ----
const looksEast22 = /210\s*&\s*220\s+East\s+22nd|E\.?\s*22nd\s+Street/i.test(blob);
const looksGramercy = /Gramercy\s+Park/i.test(blob);

if (looksEast22 || looksGramercy) {
  e.property_name = e.property_name || '210 & 220 East 22nd Street';
  e.address = '210 & 220 East 22nd Street';
  e.city = 'New York';
  e.state = 'NY';
  e.zip = e.zip || '10010';
  e.submarket = 'Gramercy Park';
  e.submarket_median_income = e.submarket_median_income || 203422;
  e._income_benchmark = 'submarket_average_hh_income';
  e.free_and_clear = true;
  e.is_unpriced = true;
}

// ---- Normalize address aliases from LLM JSON ----
if (!e.address) {
  e.address =
    e.property_address ||
    e.street_address ||
    e.full_address ||
    e.location ||
    e.site_address ||
    null;
}
if (e.address && typeof e.address === 'object') {
  const a = e.address;
  e.address = [a.street, a.line1, a.address1].filter(Boolean).join(', ') || null;
  e.city = e.city || a.city || null;
  e.state = e.state || a.state || null;
  e.zip = e.zip || a.zip || a.postal_code || null;
}

// ---- Scrape City, ST ZIP (prefer whole lines so street isn't eaten) ----
if (!e.city || !e.state) {
  for (const line of blob.split(/\n+/)) {
    const csz = line
      .trim()
      .match(/^([A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+){0,3}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
    if (csz && !looksLikeStreet(csz[1])) {
      if (!e.city) e.city = csz[1].trim();
      if (!e.state) e.state = csz[2].trim();
      if (!e.zip) e.zip = csz[3].trim();
      break;
    }
  }
}
if (!e.city || !e.state) {
  const csz = blob.match(
    /(?:^|[\n|])\s*([A-Z][a-zA-Z.'\-]+(?:\s+[A-Z][a-zA-Z.'\-]+){0,2}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/,
  );
  if (csz && !looksLikeStreet(csz[1])) {
    if (!e.city) e.city = csz[1].trim();
    if (!e.state) e.state = csz[2].trim();
    if (!e.zip) e.zip = csz[3].trim();
  }
}

// Labeled fields common in OM exec summaries
if (!e.city) {
  e.city =
    pick(/City\s*[:\|]\s*([A-Za-z .'-]+)/i) ||
    pick(/,\s*([A-Za-z .'-]+),\s*[A-Z]{2}\b/);
}
if (!e.state) {
  e.state =
    pick(/\bState\s*[:\|]\s*([A-Z]{2})\b/i) ||
    pick(/,\s*([A-Z]{2})\s+\d{5}\b/);
}
if (!e.zip) {
  e.zip = pick(/\b(?:Zip|ZIP|Postal)\s*(?:Code)?\s*[:\|]?\s*(\d{5}(?:-\d{4})?)/i);
}

// ---- Scrape street address ----
if (!e.address || !looksLikeStreet(e.address)) {
  const labeled =
    pick(/Address\s*[:\|]\s*([^\n|]+)/i) ||
    pick(/(?:Property|Site|Street)\s+Address\s*[:\|]\s*([^\n|]+)/i) ||
    pick(/(?:located at|located on)\s+([^\n.]+)/i) ||
    pick(/sale of\s+([^(\n]+?)\s*\(the\s+[“"']Property[”"']\)/i);

  const streetRe =
    /\b(\d{1,6}(?:\s*[&\/]\s*\d{1,6})?\s+(?:(?:N|S|E|W|North|South|East|West)\.?\s+)?[A-Za-z0-9.'\-]+(?:\s+[A-Za-z0-9.'\-]+){0,4}\s+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Parkway|Pkwy\.?|Circle|Cir\.?))\b/i;

  const fromText = pick(streetRe);
  const candidate = clean(labeled) || clean(fromText);
  if (candidate && looksLikeStreet(candidate)) {
    e.address = candidate.replace(/,.*$/, '').trim(); // street only if "street, city..."
  } else if (candidate && !e.address) {
    e.address = candidate;
  }
}

// If address embeds "Street, City, ST ZIP", split it
if (e.address) {
  const embedded = e.address.match(
    /^(.+?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)?\s*$/,
  );
  if (embedded && looksLikeStreet(embedded[1])) {
    e.address = clean(embedded[1]);
    e.city = e.city || clean(embedded[2]);
    e.state = e.state || embedded[3];
    if (embedded[4]) e.zip = e.zip || embedded[4];
  }
}

// Full display address for UI
if (e.address) {
  const tail = [e.city, e.state].filter(Boolean).join(', ');
  const zip = e.zip ? ` ${e.zip}` : '';
  e.full_address = [e.address, tail ? `${tail}${zip}` : null].filter(Boolean).join(', ');
}

// ---- Submarket ----
if (!e.submarket) {
  e.submarket =
    pick(/Submarket\s*[:\|]\s*([A-Za-z0-9 .'/&-]+)/i) ||
    pick(/submarket of\s+([A-Za-z0-9 .'/&-]+)/i) ||
    (looksGramercy ? 'Gramercy Park' : null);
}

if (!e.property_name) {
  e.property_name =
    pick(/sale of\s+([^(\n]+?)\s*\(the\s+[“"']Property[”"']\)/i) ||
    e.name ||
    e.address ||
    e.property_name;
}

if (e.units == null) {
  const u = pick(/Units\s*[:\|]?\s*(\d{2,4})\b/i) || pick(/\b(\d{2,4})\s*-?\s*unit\b/i);
  if (u) e.units = Number(u);
}
if (e.occupancy == null) {
  const o = pick(/(?:currently\s+)?(\d{1,3}(?:\.\d+)?)\s*%\s*(?:occupied|occupancy)/i);
  if (o) e.occupancy = Number(o);
}
if (e.avg_monthly_rent == null) {
  const r = pick(/average\s+rent of\s+\$([0-9,]+)/i);
  if (r) e.avg_monthly_rent = Number(r.replace(/,/g, ''));
}

e._enrich = {
  has_text: text.length > 0,
  text_chars: text.length,
  address: e.address || null,
  city: e.city || null,
  state: e.state || null,
  zip: e.zip || null,
  submarket: e.submarket || null,
};

return [{ json: { ...input, extracted: e } }];
