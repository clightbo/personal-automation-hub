# Apply Deal Terms / normalizeDeal fixes

Target repo: https://github.com/clightbo/clarklightbourn-pixel-perfect-capture-174

This Cloud Agent environment only has write access to `personal-automation-hub`
(formerly `stock-updates-sms`), so these changes could not be pushed to the
pixel-perfect repo.

## Option A — apply the patch
```bash
cd clarklightbourn-pixel-perfect-capture-174
git checkout -b cursor/deal-terms-bid-math-15a6
git apply deal-terms-bid-math-15a6.patch
git add -A && git commit -m "Wire Deal Terms bid sensitivity and harden deal normalization"
git push -u origin HEAD
```

## Option B — copy files from pixel-perfect-files/
Copy the five files under `pixel-perfect-files/` into the matching paths in the repo.

## Option C — relaunch Cloud Agent on the correct repo
Connect `clightbo/clarklightbourn-pixel-perfect-capture-174` to Cursor GitHub
access, then start a Cloud Agent in that repo and ask it to apply this patch.
