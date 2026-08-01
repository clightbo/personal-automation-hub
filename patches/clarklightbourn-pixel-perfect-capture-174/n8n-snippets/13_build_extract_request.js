// Build Extract Request — wire: Trim → this → LLM - Extract OM
//
// LLM node (simple):
//   Authentication: Header Auth (your CBRE / OpenRouter credential)
//   Body Content Type: Raw
//   Content Type: application/json
//   Body:  ={{ $json.openrouter_body_json }}
//   Do NOT add a manual Authorization header if credential is set.

const cfg = $("⚙️ SETTINGS").first().json;
const text = String($input.first().json.text || "");
const model = cfg.model || "deepseek/deepseek-r1-0528:free";

const system = `You are a commercial real estate analyst extracting structured data from a multifamily Offering Memorandum. Accuracy matters more than completeness.

RULES
1. Return ONLY valid JSON. No preamble, no markdown fences, no commentary. Your entire response must start with { and end with }.
2. Never estimate, infer, or calculate a value that is not stated in the document. If a field is not explicitly present, return null.
3. Numbers must be plain numeric values: no dollar signs, no commas, no percent signs. Percentages are numbers (94.5 not "94.5%").
4. Prefer TRAILING TWELVE MONTHS (T-12) / in-place / actual figures over the sponsor's pro forma or stabilized projections. If only pro forma is available, populate the field and set financials_basis to "pro_forma".
5. For every field you populate, record the page number it came from in "source_pages".
6. Populate "confidence" with one of: high, medium, low.
7. List any field you could not find in "missing_fields".
8. Many institutional OMs are marketed UNPRICED and "free and clear" — no asking price, no cap rate, no debt terms, because the buyer supplies both. This is normal, not an extraction failure. Return null for purchase_price, loan_amount and interest_rate and add them to missing_fields. Never infer a price.
9. ALWAYS try to extract a street address, city, state, and zip from the cover page / executive summary. If only city/state exist, still return those. Put the best single-line location in "address".
10. Extract the rent comparables table into rent_comps when present. Extract the supply / pipeline table into supply_deliveries. If the OM states pipeline units vs submarket stock (or pipeline as % of stock), fill pipeline_units, submarket_stock_units, and pipeline_pct_of_stock.
11. Put anything a human underwriter should know into "analyst_notes".

SCHEMA
{
  "property_name": string|null,
  "address": string|null,
  "full_address": string|null,
  "city": string|null,
  "state": string|null,
  "zip": string|null,
  "submarket": string|null,
  "units": number|null,
  "year_built": number|null,
  "occupancy": number|null,
  "avg_monthly_rent": number|null,
  "purchase_price": number|null,
  "gross_potential_rent": number|null,
  "other_income": number|null,
  "vacancy_loss": number|null,
  "operating_expenses": number|null,
  "noi": number|null,
  "replacement_reserves_per_unit": number|null,
  "loan_amount": number|null,
  "interest_rate": number|null,
  "amortization_years": number|null,
  "submarket_median_income": number|null,
  "pipeline_units": number|null,
  "submarket_stock_units": number|null,
  "pipeline_pct_of_stock": number|null,
  "rent_comps": [
    {
      "property": string,
      "units": number|null,
      "year_built": number|null,
      "avg_rent": number|null,
      "occupancy": number|null,
      "distance_miles": number|null
    }
  ],
  "supply_deliveries": [
    {
      "year": string|number,
      "deliveries": number|null,
      "pct_of_stock": number|null
    }
  ],
  "financials_basis": "t12"|"in_place"|"pro_forma"|"mixed"|null,
  "is_unpriced": boolean,
  "free_and_clear": boolean,
  "source_pages": { "<field_name>": number },
  "confidence": { "<field_name>": "high"|"medium"|"low" },
  "missing_fields": [ string ],
  "analyst_notes": [ string ]
}

If the document is not a multifamily offering memorandum, return:
{ "error": "not_a_multifamily_om", "detected_document_type": "<description>" }`;

const openrouter_body = {
  model,
  temperature: 0,
  max_tokens: 6000,
  messages: [
    { role: "system", content: system },
    {
      role: "user",
      content:
        "Extract the deal data from the following Offering Memorandum. Return only JSON.\n\n<offering_memorandum>\n" +
        text +
        "\n</offering_memorandum>",
    },
  ],
};

return [
  {
    json: {
      ...$input.first().json,
      text,
      model,
      openrouter_body,
      // Pre-stringified for LLM Raw body (avoids n8n JSON Body / [object Object] bugs)
      openrouter_body_json: JSON.stringify(openrouter_body),
    },
  },
];
