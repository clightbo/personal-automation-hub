# Fix empty JSON response (`Unexpected end of JSON input`)

## What it means
The browser got **HTTP 200** but the **body was empty** (0 bytes).  
`response.json()` then throws: `Unexpected end of JSON input`.

Verified against live webhook `screen-om-free`: `http=200 bytes=0`.

## Fix in n8n (this is the real fix)

1. Open the screening workflow
2. Open node **Respond to Lovable** (or whatever responds to the webhook)
3. Respond With: **JSON**
4. Response Body — change from:
   `={{ JSON.stringify($json) }}`
   to:
   `={{ $json }}`
5. **Save** (and activate if needed)

Path should still be something like:  
`Metrics` → assemble/code → **Respond to Lovable**

## Quick check after a run
1. n8n → **Executions** → open the run
2. Click **Respond to Lovable**
3. Confirm output JSON is non-empty (`property`, `metrics`, `narrative`, …)
4. Hard-refresh the app and retry once

## Frontend harden (optional, clearer toast)
Apply `files/src/routes/index.tsx` so an empty body shows a clear message instead of `Unexpected end of JSON input`.
