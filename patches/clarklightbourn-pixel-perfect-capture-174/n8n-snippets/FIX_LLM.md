# Fix the LLM extract (do this before 5am so you’re ready)

Your runs **stop at LLM - Extract OM**. That’s the free-model cap until ~5am.  
This upgrade makes the **next** successful Extract pull address + comps + supply like the sample deal.

## A) SETTINGS — free model slug

Open **⚙️ SETTINGS** → `model` → use a **live free** slug (must end in `:free`):

Try in order (if one 404s, try next):
1. `deepseek/deepseek-r1-0528:free`
2. `deepseek/deepseek-chat-v3-0324:free`
3. `nvidia/nemotron-3-super-120b-a12b:free`

Confirm on https://openrouter.ai/models (search `:free`).

**Save.**

## B) Add Code node — Build Extract Request

1. On the canvas, between **Trim For Context Window** and **LLM - Extract OM**, click **+**
2. Add **Code** node
3. Name it exactly: `Build Extract Request`
4. Paste ALL of `13_build_extract_request.js`
5. Wire:

```
Trim For Context Window → Build Extract Request → LLM - Extract OM
```

(Disconnect the old Trim → LLM wire.)

## C) Simplify LLM - Extract OM body

Open **LLM - Extract OM**:

1. Keep Method POST, URL `={{ $('⚙️ SETTINGS').first().json.api_url }}`, same Header Auth credential
2. Body → JSON → **replace the entire giant expression** with:

```
={{ $json.openrouter_body }}
```

3. Timeout can stay `180000`
4. **Save** node + **Save** workflow

## D) Parse Extraction — mark bad docs fatal (optional 30s)

At the **end** of Parse Extraction, before `return`, ensure invalid OMs set fatal.  
If your Parse already returns `extracted`, add after parse success / salvage:

```javascript
const core = ['property_name', 'units', 'noi', 'occupancy', 'gross_potential_rent'];
const found = core.filter((k) => extracted[k] != null && extracted[k] !== '').length;
const fatal =
  extracted.error === 'not_a_multifamily_om' ||
  (extracted.extracted && extracted.extracted.error === 'not_a_multifamily_om') ||
  found < 2;

// merge into return json:
// fatal,
```

And include `fatal` on the returned `json` object so **Valid OM?** can route to Respond Invalid Document.

## E) After 5am — one test only

1. Unpin old East-22nd webhook pin if you want a different PDF
2. Upload **once** from the site
3. Executions → **LLM - Extract OM** must be green
4. Check output JSON has `address` / `city` / `rent_comps` / `pipeline_pct_of_stock` when the OM has them

If Extract is still rate-limited, wait — do not spam retries.
