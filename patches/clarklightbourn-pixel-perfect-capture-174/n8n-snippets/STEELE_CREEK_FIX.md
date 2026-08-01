# Steele Creek fix — Affordability + Competitive Supply

Your memo already had the facts; scrapers missed the phrasing:
- `1,127 pipeline units in Cherry Creek vs 19,382` (word **pipeline** before **units**)
- `1-mile avg household income $230K+`

## Paste (Workflows editor)

### 1) Parse Extraction — replace ALL
https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/05_parse_extraction.js  
Ctrl+F: `pipeline\\s+units`

### 2) Metrics — replace ALL  
https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/06_metrics_FULL.js  
Ctrl+F: `scrapeHouseholdIncome`

### 3) Keep Quick Assemble (so it finishes)
`Metrics → Quick Assemble → Respond`

Save → re-upload Steele Creek.

## Expected
- Competitive Supply **PASS** (~5.8%)
- Affordability **PASS** or scored (RTI from rent vs ~$230k HH income) — needs avg rent in extract too
- Submarket **Cherry Creek**, city **Denver**
- Market panel shows Pipeline row
