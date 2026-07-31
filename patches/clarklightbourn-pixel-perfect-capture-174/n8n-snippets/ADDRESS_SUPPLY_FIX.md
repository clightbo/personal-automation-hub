# Fix: Address + Competitive Supply routing

Feedback from real OM run:
1. **Address missing** — parser didn’t scrape City/State/Zip from exec summary
2. **Competitive Supply UNKNOWN** — memo correctly cited “1,127 units vs 19,382 in CBD” but risk module never got `pipeline_pct_of_stock`

## Paste these 3 nodes (Raw URLs)

Base:
`https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/`

### 1) Enrich Extraction — replace all
`01_enrich_extraction.js`

Scrapes street + `City, ST ZIP` from Trim/PDF text (any OM, not just Gramercy).

### 2) Build Market Pack — replace all
`02_build_market_pack.js`

Scrapes pipeline from OM text (`1,127 units vs 19,382` → ~5.8% of stock) and sets `market.pipeline_pct_of_stock` so `runRules` can score Competitive Supply.

### 3) Metrics entry — bottom only
`04_metrics_ENTRY_ONLY.js`

After `/* ===== n8n entry point ===== */`, replace to end of file. Adds a safety patch: if market has pipeline % but Competitive Supply is still UNKNOWN, rewrite that flag to PASS/HIGH/CRITICAL.

## Expected after re-run
- Header shows a real street address (and city/state when found)
- Risk → Competitive Supply = **PASS** for ~5.8% pipeline (HIGH only above 10%)
- Market panel shows a Pipeline row when yearly deliveries aren’t listed

Wire must stay: `Parse → Enrich → Build Market Pack → Valid OM? → Metrics → …`
