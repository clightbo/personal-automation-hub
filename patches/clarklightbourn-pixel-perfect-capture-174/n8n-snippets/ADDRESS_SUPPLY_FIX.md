# Address + Competitive Supply — full paste guide

Do these **3 pastes in order**. Save after each one. Then re-upload the OM.

---

## Before you start

1. Open n8n → your **Screen OM** (DealScreen) workflow
2. Make sure you are in **Edit** mode (not just viewing an execution)
3. Confirm the chain looks like this (names can vary slightly):

```
Webhook → SETTINGS → Extract PDF → Trim → LLM Extract → Parse Extraction
  → Enrich Extraction → Build Market Pack → Valid OM?
  → Metrics + Risk Rules Engine → LLM Write Memo → Assemble → Respond
```

If **Enrich Extraction** or **Build Market Pack** do not exist yet, Step 1 / Step 2 tell you how to add them.

---

## Step 1 — Enrich Extraction (fixes the address)

**What this does:** Reads the OM text and fills `address`, `city`, `state`, `zip`, `submarket`.

### If the node already exists
1. Click the node named **Enrich Extraction** (or whatever you named the enrich Code node)
2. Click inside the JavaScript / Code box
3. Select all (`Ctrl+A` / `Cmd+A`) → Delete
4. Open this link in a new browser tab (shows plain text):

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/01_enrich_extraction.js

5. Select all on that page → Copy
6. Paste into the n8n Code box
7. Click **Save** on the workflow (top right)

### If the node does NOT exist
1. Hover the connection **after Parse Extraction**
2. Click **+**
3. Search **Code** → choose **Code** (JavaScript)
4. Rename the node to: `Enrich Extraction`
5. Paste the same Raw file as above
6. Connect: **Parse Extraction → Enrich Extraction**
7. Save

---

## Step 2 — Build Market Pack (fixes Competitive Supply UNKNOWN)

**What this does:** Finds pipeline language in the OM (e.g. `1,127 units vs 19,382 in CBD`) and sets `market.pipeline_pct_of_stock` (~5.8%). That number is what the risk engine needs for Competitive Supply.

### If the node already exists
1. Click **Build Market Pack**
2. Select all code → Delete
3. Open this Raw link → Copy all:

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/02_build_market_pack.js

4. Paste into the Code box
5. Save

### If the node does NOT exist
1. Click **+** after **Enrich Extraction**
2. Add **Code** → name it `Build Market Pack`
3. Paste the Raw file above
4. Connect: **Enrich Extraction → Build Market Pack → Valid OM?**
5. Important: remove any old wire that goes **Parse Extraction → Valid OM?** directly (that bypasses Enrich + Market Pack)
6. Save

---

## Step 3 — Metrics entry (safety net for the supply flag)

**What this does:** After risk rules run, if Competitive Supply is still UNKNOWN but market has a pipeline %, rewrite that flag to PASS / HIGH / CRITICAL.

1. Click **Metrics + Risk Rules Engine**
2. Scroll to the **bottom** of the code until you see exactly:

```
/* ===== n8n entry point ===== */
```

3. **Keep everything ABOVE that line** (all the helper functions). Do not delete the top.
4. Select from that comment line **through the very end** of the file → Delete
5. Open this Raw link → Copy **all** of it:

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/04_metrics_ENTRY_ONLY.js

6. Paste it where you deleted (starting at the bottom)
7. You should still see the helpers on top, then the entry comment / new code at the bottom
8. Save

---

## Step 4 — Run it

1. Save the whole workflow one more time
2. Go back to the DealScreen site
3. Upload the **same real OM** again
4. Wait for the run to finish (can take a few minutes)

---

## How to know it worked

| Check | Where | Good result |
|--------|--------|-------------|
| Address | Deal header / brief | Real street (and city/state if in OM) — not `—` |
| Competitive Supply | Risk & kill criteria | **PASS** if pipeline ~5.8% (HIGH only if &gt;10%) |
| Pipeline number | n8n → Build Market Pack output | `pipeline_pct_of_stock` is a number (e.g. `5.8`) |
| Market panel | Market Research | At least one Pipeline / supply row |

### Quick n8n check (optional but useful)
1. Open **Executions** → latest successful run
2. Click **Enrich Extraction** → output should show `extracted.address` filled
3. Click **Build Market Pack** → output should show `market.pipeline_pct_of_stock: 5.8` (or similar)
4. Click **Metrics** → flags → Competitive Supply should not be UNKNOWN

---

## If something still fails

**Address still blank**
- Enrich may not be reading Trim text. In the Enrich output, look at `_enrich.has_text`. If `false`, rename your trim node to exactly `Trim For Context Window`, or tell me the real node name and we retarget it.

**Supply still UNKNOWN**
- Confirm Build Market Pack is **between** Enrich and Valid OM? (not skipped)
- Confirm you re-pasted Metrics entry (Step 3)
- In Build Market Pack output, if `pipeline_pct_of_stock` is `null`, the OM wording didn’t match — paste one pipeline sentence from the OM and we add a pattern

**Parse Extraction JSON error again**
- Paste `05_parse_extraction.js` into Parse Extraction first (see `PARSE_FIX.md`)
