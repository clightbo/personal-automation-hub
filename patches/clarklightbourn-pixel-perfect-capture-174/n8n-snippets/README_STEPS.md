# Tiny n8n steps (no huge file)

Do ONE step at a time. Each file is small.

## Step 0 — Fix Parse Extraction (if JSON error)

If you see: `Expected ',' or '}' after property value in JSON…`

1. Open **Parse Extraction**
2. Replace all code with: .../n8n-snippets/05_parse_extraction.js
3. See also: `PARSE_FIX.md`
4. Save → re-run OM

## Step A — Enrich Extraction
1. Click + after Parse Extraction
2. Core → Code
3. Name: Enrich Extraction
4. Open https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/01_enrich_extraction.js
5. Select all → Copy → paste into the Code box
6. Connect: Parse Extraction → Enrich Extraction
7. Save

## Step B — Build Market Pack
1. + after Enrich Extraction → Core → Code
2. Name: Build Market Pack
3. Paste from: .../n8n-snippets/02_build_market_pack.js
4. Connect: Enrich Extraction → Build Market Pack → Valid OM?
5. Delete old line Parse → Valid OM? if still there
6. Save

## Step C — Metrics entry only
1. Open Metrics + Risk Rules Engine
2. Scroll to the bottom until you see: /* ===== n8n entry point ===== */
3. Delete FROM that line to the end of the file
4. Paste ALL of: .../n8n-snippets/04_metrics_ENTRY_ONLY.js
5. Keep everything ABOVE that comment (helpers) untouched
6. Save

## Step D — Assemble Response
1. Open Assemble Response
2. Replace all code with: .../n8n-snippets/03_assemble_response.js
3. Save

Done. Run East 22nd once.
