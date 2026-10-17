# Restore rich IC brief (commit 78cb496)

Your Lovable GitHub `main` is still on the **thin** deal page (no DealBrief / section nav).
That’s why the app looks like it has “less information.” The investment memo component is the same — the **top IC brief** (headline, thesis, risk, guidance vs max bid) is what’s missing.

These files are exact copies from good commit `78cb496` (“Added n8n expression body”).

## Paste into Lovable chat

> Replace these 4 files with the versions from commit `78cb496` on this repo’s history (before the bad “Changes” / “Fixed duplicate components” commits). Restore the IC brief layout:
>
> 1. `src/routes/deal.$dealId.tsx` — must import and render `DealBrief`, `DealSectionNav`, `DealChat`, and call `hydrateDealMetrics`
> 2. `src/routes/index.tsx` — upload desk with timeout / no demo-on-failure
> 3. `src/components/deal/DealChat.tsx`
> 4. `src/lib/screening-result.ts`
>
> Do not use the simplified key-metrics-only deal page. Keep DealBrief at the top.

## Or copy from this folder
```bash
cd clarklightbourn-pixel-perfect-capture-174
cp -R ../personal-automation-hub/patches/clarklightbourn-pixel-perfect-capture-174/RESTORE-to-78cb496/src/* ./src/
git add -A && git commit -m "Restore IC brief deal page from 78cb496"
git push origin main
```

## If the memo bullets are still empty after UI restore
That’s n8n returning a thin `narrative` object — frontend can only display what the webhook sends. Sample deals (`Load Sample` / `Open sample IC brief`) should show full strengths/concerns/questions.
