# Fix Competitive Supply UNKNOWN + bid ladder (paste in n8n)

Do these **in n8n** (no Lovable edit required for supply / ladder).

## 1) Build Market Pack
1. Open **Build Market Pack**
2. Select all JS → delete
3. Paste entire file: `09_build_market_pack_no_demo.js`
4. Save

Stronger scrape for Steele Creek-style `1,127 … vs … 19,382` / stock near pipeline.

## 2) Metrics + Risk Rules Engine
**Option A (safest if you already pasted FULL once):**  
Replace the whole Metrics node with `14_metrics_FULL_no_demo.js`.

**What changes:**
- Pipeline % from units vs stock (fixes R3 Competitive Supply)
- Unpriced bid ladder **centered on max supportable price** (includes the $102M clearing row, not only failing $168M+ rungs)

## 3) Retest without burning LLM
1. Executions → last green Steele Creek run  
2. Pin **Parse Extraction** (or Enrich) output  
3. Run from **Build Market Pack** → Metrics → Assemble → Respond  

**Good:**
- Build Market Pack → `pipeline_pct_of_stock` ≈ **5.8** (1127 / 19382)
- Metrics → Competitive Supply **PASS** (not UNKNOWN)
- `bid_sensitivity` includes a financeable row at `max_supportable_price`

## Frontend (when you can edit Lovable again)
Copy from `files/`:
- `DealTerms.tsx` — bid defaults to max supportable
- `DealSectionNav.tsx` — tab scroll offset (stops cutting section titles in half)
- `bid-math.ts` — re-run ladder includes max supportable rung
