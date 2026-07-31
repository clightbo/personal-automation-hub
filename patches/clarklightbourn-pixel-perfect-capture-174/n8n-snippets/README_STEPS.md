# Tiny n8n steps (no huge file)

Do ONE step at a time. Each file is small.

## Step 0 — Fix Parse Extraction (if JSON error)

If you see: `Expected ',' or '}' after property value in JSON…`

1. Open **Parse Extraction**
2. Replace all code with: .../n8n-snippets/05_parse_extraction.js
3. See also: `PARSE_FIX.md`
4. Save → re-run OM

## Step A — Enrich Extraction
1. Click + after Parse Extraction (or open existing Enrich Extraction)
2. Core → Code
3. Name: Enrich Extraction
4. Open https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/01_enrich_extraction.js
5. Select all → Copy → paste into the Code box
6. Connect: Parse Extraction → Enrich Extraction
7. Save

**Re-paste this whenever address is missing** — scrapes street + City, ST ZIP from OM text.

## Step B — Build Market Pack
1. + after Enrich Extraction → Core → Code (or open existing)
2. Name: Build Market Pack
3. Paste from: .../n8n-snippets/02_build_market_pack.js
4. Connect: Enrich Extraction → Build Market Pack → Valid OM?
5. Delete old line Parse → Valid OM? if still there
6. Save

**Re-paste this when Competitive Supply is UNKNOWN but the memo cites pipeline** — routes OM pipeline into `pipeline_pct_of_stock`.

See also: `ADDRESS_SUPPLY_FIX.md`

## Step C — Metrics entry only
1. Open Metrics + Risk Rules Engine
2. You may **not** see `/* ===== n8n entry point ===== */` — that is fine
3. Ctrl+F for `screenDeal(` or the **last** `const input = $input.first().json` near the bottom
4. Delete FROM that bottom `const input` line to the end of the file
5. Paste ALL of: .../n8n-snippets/04_metrics_ENTRY_ONLY.js
6. Keep everything ABOVE (helpers like `computeMetrics`, `runRules`) untouched
7. Save

See `ADDRESS_SUPPLY_FIX.md` Step 3 for the full version.

## Step D — Assemble Response
1. Open Assemble Response
2. Replace all code with: .../n8n-snippets/03_assemble_response.js
3. Save

Done. Run East 22nd once.
