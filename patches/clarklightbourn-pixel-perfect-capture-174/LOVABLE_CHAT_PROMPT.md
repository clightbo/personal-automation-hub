# Paste this into Lovable chat (don’t edit files by hand)

Lovable often locks the code editor. Use the **chat box** on the left/bottom instead.

Copy everything inside the box below → paste into Lovable chat → send.

---

```
Update src/routes/index.tsx only.

Problem: when the n8n webhook is slow or fails, the app navigates to a mock/sample deal. That looks like a bad screening result. Meanwhile n8n often finishes successfully a minute later.

Changes required:
1. Keep posting the PDF to https://clarkcbre.app.n8n.cloud/webhook/screen-om-free with FormData (data, deal_terms, market, criteria, assumptions).
2. Keep sending default deal_terms: ltv 60, interest_rate 6.5, amortization_years 30, min_dscr 1.25, min_debt_yield 9.
3. Keep sending default assumptions: hold_years 5, rent_growth 3, expense_growth 3, sale_cost_pct 2, target_irr 15.
4. Add AbortController with a 4-minute timeout on the fetch.
5. While waiting, keep the ProcessingStepper on screen with elapsed seconds and a status hint that free extract models can take 60–180s. Do not treat the stepper animation finishing as failure.
6. On success: normalizeDeal → hydrateDealMetrics → saveScreeningResult → navigate to /deal/$dealId as today.
7. On failure or timeout: show a toast.error explaining the failure and that they should check n8n Executions. Reset stage to null. Stay on the upload page.
8. CRITICAL: remove the fallback that navigates to mockDeals[2] (or any mock deal) when live screening fails. Never open the sample/demo deal on a failed or timed-out webhook. The "Open sample IC brief" button can remain.

Do not redesign the page. Only change the screening wait / error behavior in index.tsx.
```
