# n8n Fix E — stop the 3‑minute reset (respond before the memo)

## What’s happening

The site waits on the webhook HTTP response. Your workflow does:

Extract LLM (slow) → Metrics → **Memo LLM (slow again)** → Respond

Cloud / browser often kills that connection around **~2–3 minutes**. The new site then goes back to upload (no more demo). n8n can still finish and show Success after that.

## Fix (do this in n8n — no Lovable credits)

You need the browser to get JSON **before** the memo LLM runs.

### Steps

1. Open **screen-om-free** workflow → **Save** a backup / duplicate first.
2. Click the **Webhook** node → set response mode to:
   **Using 'Respond to Webhook' Node**  
   (wording may be “When Last Node Finishes” vs “Respond to Webhook” — pick the Respond-to-Webhook option).
3. After **Metrics + Risk Rules Engine**, add a **Respond to Webhook** node.
4. Wire: `Metrics + Risk Rules Engine` → `Respond to Webhook` → (optional) `LLM Write Memo` → old Assemble (memo only).

5. In **Respond to Webhook**, respond with JSON from the Metrics node. Example expression for the response body (adjust if your Assemble wraps differently):

```
={{
  {
    ...($json),
    narrative: $json.narrative || {
      headline: 'Memo pending',
      executive_summary: 'Metrics and risk are ready. Full memo was skipped so the webhook can return before timeout.',
      key_strengths: [],
      key_concerns: [],
      critical_questions: [],
      recommended_next_steps: []
    }
  }
}}
```

Or if Metrics already returns the full screening object, just:

**Respond With:** JSON  
**Response Body:** `={{ $json }}`

6. **Save** the workflow.

### Optional: memo after respond

You can still run **LLM Write Memo** *after* Respond to Webhook. The user already got metrics; memo won’t block the browser. (UI won’t get that late memo unless you add a second fetch later.)

### If it still times out

Then **Extract OM** alone is >2–3 min on free Nemotron. Switch extract to a faster/paid model, or shorten the PDF / trim text more aggressively.

## After this + website paste

Upload again → you should land on the real deal dashboard (memo may be thin until you add async memo).
