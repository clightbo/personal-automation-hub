# Apply DealScreen chat / settings / sample-banner fixes

Target repo: https://github.com/clightbo/clarklightbourn-pixel-perfect-capture-174  
Live Lovable app: https://clarklightbourn-pixel-perfect-capture-174.lovable.app

This Cloud Agent environment **cannot push** to the Lovable-linked repo (`cursor[bot]` gets 403).  
Copy these files into that repo (or apply the patch) so Lovable syncs them.

## What you get
1. **Honest OM chat** — `DealChat` answers from real screened metrics (no fabricated numbers / fake page citations)
2. **Analysis settings wired** — upload form collects DSCR/hold/IRR/market/notes/guardrails and posts them to n8n; optional `VITE_SCREEN_API_KEY` → `x-api-key`; 50 MB PDF guard
3. **Sample data banner** — mock/fallback deals show an honest “Sample data” notice
4. **Address fallback** — `normalizeDeal` falls back to city/state, then submarket, before “Address not stated in OM”
5. **n8n workflow** — not in either repo (no `n8n-nodes-base.webhook` JSON). Skip / re-import manually in n8n if you have the export elsewhere.

## Apply by copying files
```bash
cd clarklightbourn-pixel-perfect-capture-174
cp -R path/to/patches/clarklightbourn-pixel-perfect-capture-174/files/* .
# or: git apply path/to/.../chat-settings-sample-banner-6ba0.patch
git checkout -b cursor/dealscreen-chat-settings-banner-6ba0
git add -A
git commit -m "Fix chat fabrication, wire settings, sample banner, address fallback (+n8n patches)"
git push -u origin HEAD
# then merge to main so Lovable redeploys
```

Files replaced/updated under `files/`:
- `src/components/deal/DealChat.tsx`
- `src/routes/index.tsx`
- `src/routes/deal.$dealId.tsx`
- `src/lib/screening-result.ts`

Notes when applying on current `main`:
- `DealTerms` uses `onDealUpdate` (not `onRecompute`); the parked `deal.$dealId.tsx` already matches that.
- `<DealChat deal={deal} />` is kept on the deal page so the chat fix is reachable.
- Applying `deal.$dealId.tsx` as written replaces the IC-brief layout with the simpler key-metrics layout from the prompt. If you want to keep IC brief / section nav, cherry-pick only the sample-banner block + `MOCK_IDS` logic instead of the full file.
