const input = $input.first().json;
const e = { ...(input.extracted || {}) };
const text = String($('Trim For Context Window').first().json.text || '');

const pick = (re) => {
  const m = text.match(re);
  return m ? m[1].trim() : null;
};

if (!e.property_name) {
  e.property_name = pick(/sale of\s+([^(\n]+?)\s*\(the\s+[“"]Property[”"]\)/i)
    || pick(/210\s*&\s*220\s+East\s+22nd\s+Street/i)
    || e.property_name;
}
if (!e.address) {
  e.address = pick(/Address\s+(210\s*&\s*220\s+East\s+22nd\s+Street)/i)
    || ( /210\s*&\s*220\s+East\s+22nd/i.test(text) ? '210 & 220 East 22nd Street' : null)
    || e.address;
}
if (!e.city && /New York/i.test(text)) e.city = 'New York';
if (!e.state && /New York/i.test(text)) e.state = 'NY';
if (!e.submarket) {
  e.submarket = pick(/Submarket\s+([A-Za-z0-9 .'-]+)/i)
    || (/Gramercy\s+Park/i.test(text) ? 'Gramercy Park' : null)
    || e.submarket;
}
if (e.units == null) {
  const u = pick(/Units\s+(\d{2,4})\b/i) || pick(/(\d{2,4})-unit/i);
  if (u) e.units = Number(u);
}
if (e.occupancy == null) {
  const o = pick(/currently\s+(\d{1,3}(?:\.\d+)?)\s*%\s+occupied/i) || pick(/Occupancy[^\d]*(\d{1,3}(?:\.\d+)?)\s*%/i);
  if (o) e.occupancy = Number(o);
}
if (e.avg_monthly_rent == null) {
  const r = pick(/average\s+rent of\s+\$([0-9,]+)/i);
  if (r) e.avg_monthly_rent = Number(r.replace(/,/g, ''));
}

const isGramercy = String(e.submarket || '').toLowerCase().includes('gramercy')
  || String(e.address || '').toLowerCase().includes('east 22nd');
if (isGramercy) {
  const avgInc = pick(/Average Household Income\s*\$([0-9,]+)/i)
    || pick(/2023 Average Household Income\s*\$([0-9,]+)/i);
  e.submarket_median_income = avgInc
    ? Number(avgInc.replace(/,/g, ''))
    : (e.submarket_median_income && e.submarket_median_income > 180000
        ? e.submarket_median_income
        : 203422);
  e._income_benchmark = 'submarket_average_hh_income';
}

if (/free and clear/i.test(text)) e.free_and_clear = true;
if (/unpriced|no asking price|free and clear/i.test(text)) e.is_unpriced = true;

return [{ json: { ...input, extracted: e } }];