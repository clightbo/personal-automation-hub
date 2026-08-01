# Tonight (no OpenRouter spend) + LLM fix for 5am

## 1) LLM extract (do now, test at 5am)
Follow **`FIX_LLM.md`**
| File | Node |
|------|------|
| `13_build_extract_request.js` | NEW: Build Extract Request (before LLM) |

Also set SETTINGS `model` to a live `…:free` DeepSeek slug (see FIX_LLM.md).

## 2) Address / market / supply (Code nodes)
Follow **`FIX_ADDRESS_MARKET_SUPPLY.md`**
| File | Node |
|------|------|
| `11_enrich_address_always.js` | Enrich |
| `09_build_market_pack_no_demo.js` | Build Market Pack |
| `10_assemble_address_market.js` | Assemble Response |
| `12_metrics_delete_gramercy_demo.md` | Metrics + Parse (delete blocks) |

Frontend (GitHub push when you can):
`files/src/components/deal/MarketResearch.tsx` — empty state instead of blank tables.
