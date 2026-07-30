import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { RecommendationBadge } from "@/components/deal/primitives";
import { fmtMoney } from "@/lib/deal-types";
import { mockDeals } from "@/lib/mock-deals";
import { listScreeningResults } from "@/lib/screening-result";
import { useEffect, useState } from "react";
import type { Deal } from "@/lib/deal-types";

export const Route = createFileRoute("/pipeline")({
  component: Pipeline,
  head: () => ({
    meta: [
      { title: "Deal Pipeline | DealScreen AI" },
      {
        name: "description",
        content:
          "Compare screened multifamily OMs — recommendation, guidance price, max supportable bid, DSCR, cap rate and risk.",
      },
      { property: "og:title", content: "Deal Pipeline | DealScreen AI" },
      {
        property: "og:description",
        content:
          "Review screened multifamily deals with recommendation, pricing, DSCR, cap rate and risk score.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Pipeline() {
  const [deals, setDeals] = useState<Deal[]>(mockDeals);

  useEffect(() => {
    const live = listScreeningResults();
    const ids = new Set(live.map((d) => d.id));
    setDeals([...live, ...mockDeals.filter((d) => !ids.has(d.id))]);
  }, []);

  return (
    <AppShell>
      <div className="animate-rise">
        <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Active pipeline
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight">
          Deal pipeline
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Compare offerings the way an acquisitions desk does: recommendation,
          guidance vs max supportable, coverage, and risk before opening the brief.
        </p>

        <div className="card-surface mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Rec</th>
                  <th className="px-4 py-3 font-medium">Guidance</th>
                  <th className="px-4 py-3 font-medium">Max bid</th>
                  <th className="px-4 py-3 font-medium">$/Unit</th>
                  <th className="px-4 py-3 font-medium">Cap</th>
                  <th className="px-4 py-3 font-medium">DSCR</th>
                  <th className="px-4 py-3 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-border/70 transition-colors last:border-0 hover:bg-secondary/60"
                  >
                    <td className="px-4 py-3.5">
                      <Link
                        to="/deal/$dealId"
                        params={{ dealId: d.id }}
                        className="block font-medium hover:underline"
                      >
                        {d.property.name}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {d.property.units} units · {d.property.submarket} · {d.screened_on}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <RecommendationBadge value={d.summary.recommendation} size="sm" />
                    </td>
                    <td className="num px-4 py-3.5">
                      {d.deal_terms.stated_price == null
                        ? "Unpriced"
                        : fmtMoney(d.deal_terms.stated_price)}
                    </td>
                    <td className="num px-4 py-3.5 font-medium">
                      {fmtMoney(d.max_supportable_price)}
                    </td>
                    <td className="num px-4 py-3.5">
                      {d.metrics.price_per_unit.value == null
                        ? "—"
                        : `$${Math.round(d.metrics.price_per_unit.value).toLocaleString()}`}
                    </td>
                    <td className="num px-4 py-3.5">
                      {d.metrics.cap_rate.value == null
                        ? "—"
                        : `${d.metrics.cap_rate.value.toFixed(2)}%`}
                    </td>
                    <td className="num px-4 py-3.5">
                      {d.metrics.dscr.value == null
                        ? "—"
                        : `${d.metrics.dscr.value.toFixed(2)}x`}
                    </td>
                    <td className="num px-4 py-3.5 font-semibold">{d.summary.risk_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
