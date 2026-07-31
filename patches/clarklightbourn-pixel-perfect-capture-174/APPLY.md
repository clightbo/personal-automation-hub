# Apply DealScreen IC brief + bid-math updates

Target repo: https://github.com/clightbo/clarklightbourn-pixel-perfect-capture-174  
Live Lovable app: https://clarklightbourn-pixel-perfect-capture-174.lovable.app

This Cloud Agent environment cannot push to the Lovable-linked repo.
Copy these files into that repo (or apply the patch) so Lovable syncs them.

## What you get
1. **IC-style deal brief** — recommendation, thesis, risk, guidance vs max bid first
2. **Primary vs secondary metrics** — cap / DSCR / debt yield / NOI / $/unit / occ up front
3. **Sticky section nav** — Brief → Metrics → Risk → Bid → Terms → Market → Memo
4. **Richer pipeline** — guidance, max bid, $/unit, cap, DSCR, risk
5. **Client bid-math** — Re-run sensitivity actually recomputes the ladder
6. **Hardened normalizeDeal / narrative** — name/address + object bullet fixes
7. **Institutional formatting** — Source Serif + IBM Plex, paper atmosphere
8. **No demo-on-timeout** — slow n8n runs wait up to 4 min and show an error instead of opening the sample deal

## Apply by copying files
```bash
cd clarklightbourn-pixel-perfect-capture-174
cp -R path/to/patches/.../files/* .
# or selectively copy the listed paths under files/
git checkout -b cursor/pm-dashboard-formatting-15a6
git add -A && git commit -m "IC-style portfolio manager dashboard formatting"
git push -u origin HEAD
```

Then open/refresh the Lovable project — commits on the connected branch sync back.
