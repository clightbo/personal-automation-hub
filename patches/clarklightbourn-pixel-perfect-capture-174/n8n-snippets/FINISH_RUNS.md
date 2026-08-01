# Runs never finish — skip the Memo LLM

Free Extract + Memo LLMs often hang past 3–10 minutes. The site gives up.  
**You do not need the memo LLM for a finished screen.**

## First: see where it’s stuck

1. n8n → **Executions**
2. Open a running / failed run
3. Which node is still spinning or last green?
   - Stuck on **LLM Extract** → extract model is too slow / rate-limited  
   - Stuck on **LLM Write Memo** → skip it (steps below)  
   - Stuck on **Parse / Metrics** → tell me; that would be unexpected

---

## Fix now — respond after Metrics (skip memo)

Do this in **Workflows** editor (not Executions):

### 1) Add Quick Assemble
1. Click **+** after **Metrics + Risk Rules Engine**
2. Add **Code**
3. Name it: `Quick Assemble`
4. Paste ALL of:

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/08_quick_assemble.js

### 2) Wire Respond to finish early
1. Find your **Respond to Lovable** (or Respond to Webhook) node
2. Disconnect it from Memo / old Assemble if needed
3. Wire:

```
Metrics + Risk Rules Engine → Quick Assemble → Respond to Lovable
```

4. Leave **LLM Write Memo** unconnected for now (or delete the wire into it). You can reconnect later.

### 3) Respond body
Open **Respond to Lovable**:
- Respond With: **JSON**
- Response Body: `={{ $json }}`  
  (not `JSON.stringify($json)`)

### 4) Webhook mode
Open **Webhook** node → response mode = **Using Respond to Webhook node** (or your Respond node).

### 5) Save → upload OM from the site once

You should get a finished dashboard with metrics + risk. Memo text will be a short stub (that’s OK).

---

## If it STILL never finishes

It’s stuck on **LLM Extract** (before Metrics). Then:

1. Open the Extract LLM node  
2. Switch model to something faster, or  
3. Shorten Trim (smaller context), or  
4. Wait and check Executions — if Extract alone takes >5 min on free Nemotron, the free model is the bottleneck

Optional: in Extract, set a lower max tokens if the knobs exist.

---

## After runs finish again

Then we can re-check address / Competitive Supply / market on a **completed** Metrics output (`_om_text_chars`, `market.pipeline_pct_of_stock`).
