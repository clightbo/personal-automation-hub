# Metrics — delete Gramercy demo pack (1 minute)

In **Metrics + Risk Rules Engine**, find this block (search for `gramercy`) and **delete the whole `if`**:

```javascript
// Gramercy shortcut if detected in text
if (/gramercy|east 22nd|e\.?\s*22nd/i.test(omText)) {
  ...
  market.source = market.source || 'metrics_gramercy_pack';
}
```

Keep `patchCompetitiveSupply(result, market);` — that is what turns pipeline % into a real Competitive Supply flag.

Also in **Parse Extraction**, delete the similar block that starts with:
`if (/gramercy|east 22nd|e\.?\s*22nd/i.test(blob)) {`

Same for hardcoded Cherry Creek / Denver / New York lines in `enrichSubmarketGeo` if you want zero demo geo — optional.
