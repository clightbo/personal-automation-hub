# Still no address / Competitive Supply / Market?

Enrich + Market Pack are probably missing or unwired. **Fix it inside Metrics alone.**

## Do this (from Workflows editor — not Executions)

1. Open **Workflows** → your Screen OM workflow
2. Double-click **Metrics + Risk Rules Engine**
3. Select **ALL** code → Delete
4. Open this Raw URL → Select all → Copy:

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/06_metrics_FULL.js

5. Paste → Save
6. (Recommended) Open **Assemble Response** → replace all with:

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/03_assemble_response.js

7. Save → upload the OM again from the site

## What this Metrics file does now
It reads Trim/PDF text itself and:
- scrapes street + City, ST ZIP → `address`
- scrapes `1,127 units vs 19,382` → `market.pipeline_pct_of_stock` (~5.8%)
- sets Competitive Supply PASS/HIGH/CRITICAL from that number
- fills `result.market` for the Market Research panel

## Confirm in Executions (after a success)
Open the successful run → **Metrics** output:
- `address` should be a street
- `market.pipeline_pct_of_stock` should be a number
- `flags` → Competitive Supply should not be UNKNOWN
- `extraction_meta.metrics_enrich.om_text_chars` should be **> 500**

If `om_text_chars` is 0 / tiny: your Trim node has a different name. Tell me the exact Trim/PDF node name from the canvas.
