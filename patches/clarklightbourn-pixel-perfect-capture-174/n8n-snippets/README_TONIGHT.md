# Tonight (no OpenRouter spend)

Follow **`FIX_ADDRESS_MARKET_SUPPLY.md`** — paste 3 Code nodes + delete Gramercy demo blocks.

Files:
| File | Node |
|------|------|
| `11_enrich_address_always.js` | Enrich |
| `09_build_market_pack_no_demo.js` | Build Market Pack |
| `10_assemble_address_market.js` | Assemble Response |
| `12_metrics_delete_gramercy_demo.md` | Metrics + Parse (delete blocks) |

Frontend (when you can push to pixel-perfect without Lovable credits):
`files/src/components/deal/MarketResearch.tsx` — empty state instead of blank tables.
