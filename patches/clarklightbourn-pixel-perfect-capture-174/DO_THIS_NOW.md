# Do this yourself in ~2 minutes (I can’t log into Lovable or n8n)

## 1) Website — stop the demo on slow runs

1. Open this link (full file):
   https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/files/src/routes/index.tsx
2. Select all → Copy
3. In your **Lovable** project → open `src/routes/index.tsx`
4. Select all → Paste → Save / Publish

That’s it for the demo bug.

---

## 2) n8n Fix B — stabilize NOI extract (stops different numbers)

1. Open https://clarkcbre.app.n8n.cloud
2. Open the **screen-om-free** workflow
3. Click the node **LLM - Extract OM** (or whatever you named the extract chat node)
4. Find the **System Message** / system prompt box
5. Scroll to your numbered rules (around rule 9)
6. Paste these two lines right after rule 9:

```
9b. For NOI: if both T-12 and pro forma appear, ALWAYS take T-12 / in-place NOI and set financials_basis accordingly. Never blend. If multiple NOI candidates exist, pick the single figure labeled T-12 or Trailing 12 Months and put other candidates only in analyst_notes.
9c. Return the same numeric extraction on repeated runs — do not reinterpret tables.
```

7. Confirm **Temperature = 0**
8. Click **Save** (top right)
9. Optional but strongest for stable numbers: change the model from free Nemotron to a paid extract model (same prompt)

---

## 3) Quick check

1. Upload the same OM twice
2. Stay on the waiting screen (can take 1–3 min) — you should **not** land on the sample/demo deal anymore
3. In n8n → Executions → open Metrics output → `metrics.noi_source` should be `stated_in_om_pinned`
4. NOI should be much closer across runs; if still different, switch the extract model (step 2.9)
