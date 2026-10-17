# Competitive Supply still UNKNOWN — do this now

You already have `pipeline_units` (~1127). R3 stays UNKNOWN until `pipeline_pct_of_stock` is a number.

## 1) Re-paste (both nodes)
1. **Build Market Pack** → replace ALL with `09_build_market_pack_no_demo.js`
2. **Metrics + Risk Rules Engine** → replace ALL with `14_metrics_FULL_no_demo.js`
3. Save workflow

## 2) Retest without LLM
1. Executions → last green Steele Creek run  
2. Pin **Parse Extraction** (or Enrich)  
3. Run **Build Market Pack → Metrics → Assemble → Respond**

## 3) What “fixed” looks like
**Build Market Pack** output:
- `market.pipeline_pct_of_stock` ≈ **5.8** (not null)
- `market.stock_units` filled (e.g. ~19382)
- `market._supply_debug.hits` not empty

**Metrics** flags:
- Competitive Supply = **PASS** (or HIGH if % > 10) — not UNKNOWN

## 4) If still null
Open Build Market Pack → `market._supply_debug` and tell me:
- `text_chars` (should be > 1000)
- `pipelineUnits` / `stockUnits` / `pct`
- `hits`

Or paste **one sentence** from the OM that mentions pipeline / inventory and we add that pattern.
