# Fix empty JSON response

## Error you saw
`Failed to execute 'json' on 'Response': Unexpected end of JSON input`

Means: browser got HTTP 200 but the **body was empty**.

## Fix in n8n — Respond to Lovable

1. Open **Respond to Lovable**
2. Respond With: **JSON**
3. Response Body — change from:
   `={{ JSON.stringify($json) }}`
   to:
   `={{ $json }}`
4. **Save**

Your path should still be:
`Metrics` → `Code in JavaScript` → `Respond to Lovable`

## Quick test in n8n
1. Open Executions after a run
2. Click **Respond to Lovable**
3. Confirm output JSON is non-empty (property, metrics, narrative, …)

If Respond shows data but the site still gets empty, hard-refresh the app and retry once.
