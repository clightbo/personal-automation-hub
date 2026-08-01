# Still no address / supply / market — do these 3 pastes

Your Metrics scrape was blind: it could not see Trim text.  
**Parse** now stamps `om_text` + `market` onto the item so Metrics can use them.

## From Workflows editor (NOT Executions)

### A) Parse Extraction — replace ALL
https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/05_parse_extraction.js

Confirm: Ctrl+F `collectOmText`

### B) Metrics — replace ALL
https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/06_metrics_FULL.js

Confirm: Ctrl+F `om_text_source`

### C) Assemble Response — replace ALL
https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/03_assemble_response.js

Confirm: Ctrl+F `metricNames`

Save → upload OM from the site again.

## After success — 20 second check
Executions → latest Success → open **Parse Extraction** output:
- `_om_text_chars` should be a big number (thousands+)
- `address` should be filled OR `market.pipeline_pct_of_stock` should be a number

Then open **Metrics** output:
- `extraction_meta.metrics_enrich.om_text_chars` — big number
- `extraction_meta.metrics_enrich.om_text_source` — e.g. `input.om_text` or a node name
- `address` / `property.address`
- `market.pipeline_pct_of_stock`
- Competitive Supply flag not UNKNOWN

## If `_om_text_chars` is 0 or tiny
Your Trim node name is not one we try. Do this:
1. On the canvas, click the node that holds the PDF text (after Extract PDF)
2. Copy its **exact** name
3. Send it here

OR add optional Stamp node:
1. + after Trim → Code → name `Stamp OM Text`
2. Paste: .../07_stamp_om_text.js
3. Wire Trim → Stamp OM Text → LLM Extract
