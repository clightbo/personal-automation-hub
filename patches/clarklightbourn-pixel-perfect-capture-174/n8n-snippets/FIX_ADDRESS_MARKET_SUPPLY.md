# Fix address + market research + competitive supply (no LLM credits needed)

These are **Code node** pastes. You can do them **tonight** while OpenRouter is rate-limited.

## What this fixes
1. **Address** always stated (street → city/state → submarket → `"Address not stated in OM"`)
2. **Market research** — fill comps/supply from OM when present; otherwise leave **honest empty** (no Gramercy demo comps / fake $203k income)
3. **Competitive Supply** — scrape pipeline % / units-vs-stock from OM text so R3 is PASS/HIGH/CRITICAL instead of stuck UNKNOWN

## Do this in n8n (order)

### 1) Enrich
1. Open node **Enrich**
2. Select all JS → delete
3. Paste **entire** file: `11_enrich_address_always.js`
4. Save node

### 2) Build Market Pack
1. Open **Build Market Pack**
2. Replace all JS with: `09_build_market_pack_no_demo.js`
3. Save node  
   (This removes the East-22nd / Gramercy hardcoded comps pack.)

### 3) Assemble Response
1. Open **Assemble Response**
2. Replace all JS with: `10_assemble_address_market.js`
3. Save node  
   (No Memo LLM. Address + market always on the JSON you return.)

### 4) Respond to Lovable (confirm)
- Respond With: **JSON**
- Response Body: `={{ $json }}`  ← one `=`, not `==`
- Save workflow + keep **Active**

## How to verify without burning free LLM quota
Use a **prior successful Execution**:
1. Executions → open an old green run that had PDF text
2. Or pin Webhook + run from **Parse Extraction** onward (skip LLM) if you have pinned LLM output

When quota returns at 5am:
1. One upload only
2. In that Execution check:
   - **Enrich** → `extracted.address` / `full_address` not blank
   - **Build Market Pack** → `market.pipeline_pct_of_stock` number or honest `note`
   - **Metrics** → Competitive Supply not UNKNOWN if pipeline % exists
   - **Respond to Lovable** → non-empty JSON with `property.address` + `market`

## Optional (after free quota returns) — better comps from the LLM
In **LLM - Extract OM** system SCHEMA, add:

```
"rent_comps": [{"property","units","year_built","avg_rent","occupancy","distance_miles"}],
"supply_deliveries": [{"year","deliveries","pct_of_stock"}],
"pipeline_units": number|null,
"submarket_stock_units": number|null,
"pipeline_pct_of_stock": number|null
```

`09_build_market_pack_no_demo.js` already prefers those fields when the model returns them.
