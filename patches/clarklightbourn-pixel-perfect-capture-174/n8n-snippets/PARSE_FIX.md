# Parse Extraction is still using the OLD code

Your error:
```
Expected ',' or '}' after property value in JSON at position 1705 (line 66 column 4) [line 10]
```

The `[line 10]` means n8n is failing on **line 10 of your Parse Extraction node** — the old simple `JSON.parse`. The repair snippet was never pasted (or didn’t stick).

## Do this exactly (2 minutes)

1. Open n8n → Screen OM workflow → **Edit**
2. Click node **Parse Extraction**
3. Click in the Code box → **Select All** (`Ctrl+A` / `Cmd+A`) → **Delete**
4. Open this URL in a new tab (plain text):

https://raw.githubusercontent.com/clightbo/personal-automation-hub/cursor/pm-dealscreen-ic-brief-15a6/patches/clarklightbourn-pixel-perfect-capture-174/n8n-snippets/05_parse_extraction.js

5. Select All on that page → Copy
6. Paste into Parse Extraction
7. Scroll the Code box — you should see `regex_salvage` or `stripTrailingCommas` somewhere. If you only see a short `JSON.parse`, paste failed.
8. Click **Save** (workflow)
9. Re-upload the OM

## What the new node does
- Repairs trailing commas, truncated objects, smart quotes, bare keys, bad newlines
- If JSON is still broken: **salvages** noi/units/address/etc. with regex and **continues** the run (no hard fail)

## Optional — reduce broken JSON from the LLM
In **LLM Extract** prompt, add:

```
Return ONLY one valid JSON object. No markdown. No trailing commas. No comments. No text before/after.
```

## How to confirm it stuck
After Save, open Parse Extraction again and Ctrl+F for `regex_salvage`.  
If that word is there → new code is live.
