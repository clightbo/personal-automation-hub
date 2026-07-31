# Fix: Parse Extraction JSON error

Error you saw:
```
Expected ',' or '}' after property value in JSON at position 1213
```

**Cause:** Free LLM (Nemotron etc.) returned broken JSON — usually a trailing comma, truncated object, or markdown.

## Do this now (2 min)

1. Open n8n → your Screen OM workflow
2. Open node **Parse Extraction**
3. Select all code → Delete
4. Open this Raw URL, copy all, paste into the Code box:

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/05_parse_extraction.js

5. **Save** the workflow
6. Re-upload the real OM

## Optional (reduces broken JSON)

In **LLM Extract** (or whatever calls the model), add to the system/user prompt:

```
Return ONLY one valid JSON object. No markdown fences. No trailing commas. No comments. No text before or after the JSON.
```

## If it still fails

The new Parse node throws an error that includes a **snippet near the bad character** — paste that error back and we can tighten further.
