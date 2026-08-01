// Paste into: Enrich — REPLACE THE WHOLE NODE
// Generic address scrape (not Gramercy-only). Always leaves a stated address string.
// Does NOT inject demo comps / fake $203k income.

const input = $input.first().json;
const e = { ...(input.extracted || {}) };

let text = "";
const textNodes = [
  "Trim For Context Window",
  "Trim for Context Window",
  "Extract PDF Text",
  "Extract from File",
  "Extract PDF",
  "Parse Extraction",
];
for (const name of textNodes) {
  if (text) break;
  try {
    const j = $(name).first().json;
    text = String(j.om_text || j.text || j.data || j.content || "");
  } catch (err) {}
}
if (!text && typeof input.om_text === "string") text = input.om_text;

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
]
  .filter(Boolean)
  .join("\n");

const pick = (re, src = blob) => {
  const m = src.match(re);
  return m ? (m[1] || "").trim() : null;
};
const clean = (s) =>
  String(s || "")
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
    .trim();
const looksLikeStreet = (s) =>
  /^\d{1,6}(?:\s*[&\/]\s*\d{1,6})?\s+.+/i.test(String(s || "").trim()) &&
  /(Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Parkway|Pkwy\.?|Circle|Cir\.?)/i.test(
    String(s || ""),
  );

if (!e.address) {
  e.address =
    e.property_address ||
    e.street_address ||
    e.full_address ||
    e.location ||
    e.site_address ||
    null;
}
if (e.address && typeof e.address === "object") {
  const a = e.address;
  e.address = [a.street, a.line1, a.address1].filter(Boolean).join(", ") || null;
  e.city = e.city || a.city || null;
  e.state = e.state || a.state || null;
  e.zip = e.zip || a.zip || a.postal_code || null;
}

if (!e.city || !e.state) {
  for (const line of blob.split(/\n+/)) {
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
if (!e.city) e.city = pick(/City\s*[:\|]\s*([A-Za-z .'-]+)/i) || e.city;
if (!e.state) e.state = pick(/\bState\s*[:\|]\s*([A-Z]{2})\b/i) || e.state;
if (!e.zip) e.zip = pick(/\b(?:Zip|ZIP|Postal)\s*(?:Code)?\s*[:\|]?\s*(\d{5}(?:-\d{4})?)/i) || e.zip;

if (!e.address || !looksLikeStreet(e.address)) {
  const labeled =
    pick(/Address\s*[:\|]\s*([^\n|]+)/i) ||
    pick(/(?:Property|Site|Street)\s+Address\s*[:\|]\s*([^\n|]+)/i) ||
    pick(/(?:located at|located on)\s+([^\n.]+)/i);
  const streetRe =
    /\b(\d{1,6}(?:\s*[&\/]\s*\d{1,6})?\s+(?:(?:N|S|E|W|North|South|East|West)\.?\s+)?[A-Za-z0-9.'\-]+(?:\s+[A-Za-z0-9.'\-]+){0,4}\s+(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Pl\.?|Court|Ct\.?|Parkway|Pkwy\.?|Circle|Cir\.?))\b/i;
  const fromText = pick(streetRe);
  const candidate = clean(labeled) || clean(fromText);
  if (candidate && looksLikeStreet(candidate)) e.address = candidate.replace(/,.*$/, "").trim();
  else if (candidate && !e.address) e.address = candidate;
}

if (e.address) {
  const embedded = String(e.address).match(
    /^(.+?),\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)?\s*$/,
  );
  if (embedded && looksLikeStreet(embedded[1])) {
    e.address = clean(embedded[1]);
    e.city = e.city || clean(embedded[2]);
    e.state = e.state || embedded[3];
    if (embedded[4]) e.zip = e.zip || embedded[4];
  }
}

if (!e.submarket) {
  e.submarket =
    pick(/Submarket\s*[:\|]\s*([A-Za-z0-9 .'/&\-]+)/i) ||
    pick(/submarket of\s+([A-Za-z0-9 .'/&\-]+)/i) ||
    e.submarket;
}

if (!e.property_name) {
  e.property_name = e.name || e.address || e.property_name || "Screened Deal";
}

// Prefer street; else city/state; else submarket — never leave blank for UI
const cityState = [e.city, e.state].filter(Boolean).join(", ");
const zip = e.zip ? ` ${e.zip}` : "";
if (e.address && looksLikeStreet(e.address)) {
  e.full_address = [e.address, cityState ? `${cityState}${zip}` : null].filter(Boolean).join(", ");
} else if (cityState) {
  e.address = `${cityState}${zip}`.trim();
  e.full_address = e.address;
} else if (e.submarket) {
  e.address = e.submarket;
  e.full_address = e.submarket;
} else {
  e.address = "Address not stated in OM";
  e.full_address = e.address;
}

const inc =
  pick(/1-mile\s+avg(?:erage)?\s+household\s+income\s+\$?\s*([\d]{2,3}(?:\.\d+)?)\s*K\+?/i) ||
  pick(/(?:avg|average)\s+(?:household|HH)\s+income[:\s]+\$\s*([\d,]{5,})/i);
if (inc && (!e.submarket_median_income || Number(e.submarket_median_income) < 1000)) {
  const n = Number(String(inc).replace(/,/g, ""));
  e.submarket_median_income = n < 1000 ? Math.round(n * 1000) : Math.round(n);
  e._income_benchmark = "om_stated_avg_household_income";
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
  if (r) e.avg_monthly_rent = Number(r.replace(/,/g, ""));
}

if (/free and clear/i.test(blob)) e.free_and_clear = true;
if (/unpriced|no asking price|free and clear/i.test(blob)) e.is_unpriced = true;

e._enrich = {
  has_text: text.length > 0,
  text_chars: text.length,
  address: e.address || null,
  city: e.city || null,
  state: e.state || null,
  zip: e.zip || null,
  submarket: e.submarket || null,
};

return [{ json: { ...input, extracted: e, address: e.address, om_text: text || input.om_text } }];
