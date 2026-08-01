import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/deal/MetricCard";
import { RiskPanel } from "@/components/deal/RiskPanel";
import { BidSensitivity } from "@/components/deal/BidSensitivity";
import { DealChat } from "@/components/deal/DealChat";
import { DealTerms } from "@/components/deal/DealTerms";
import { MarketResearch } from "@/components/deal/MarketResearch";
import { InvestmentSummary } from "@/components/deal/InvestmentSummary";
import { RecommendationBadge, SectionHeading } from "@/components/deal/primitives";
import { getDeal, mockDeals } from "@/lib/mock-deals";
import { fmtMoney } from "@/lib/deal-types";
import { getScreeningResult } from "@/lib/screening-result";

const MOCK_IDS = new Set(mockDeals.map((d) => d.id));

export const Route = createFileRoute("/deal/$dealId")({
  loader: ({ params }) => getDeal(params.dealId) ?? null,
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.property.name} — Screening | DealScreen AI`
      : "Deal Screening | DealScreen AI";
    const description = loaderData
      ? `${loaderData.summary.recommendation}: ${loaderData.narrative.headline}`
      : "Automated multifamily investment screening dashboard.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: DealDashboard,
});

const pct = (n: number) => `${n.toFixed(1)}%`;
const x = (n: number) => `${n.toFixed(2)}x`;

function DealDashboard() {
  const { dealId } = Route.useParams();
  const loaded = Route.useLoaderData();
  const [deal, setDeal] = useState(loaded);

  useEffect(() => {
    setDeal(getScreeningResult(dealId) ?? getDeal(dealId) ?? null);
  }, [dealId]);

  if (!deal) {
    return (
      <AppShell>
        <div className="py-24 text-center">
          <h1 className="text-xl font-semibold">Screening result not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This result may have expired. Run the screening again.
          </p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
            Back to upload
          </Link>
        </div>
      </AppShell>
    );
  }

  const m = deal.metrics;
  const isSample = MOCK_IDS.has(deal.id);

  return (
    <AppShell>
      {isSample ? (
        <div className="mb-4 rounded-md border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn-foreground print:hidden">
          <span className="font-semibold">Sample data.</span> This is an illustrative deal, not a
          live screening result. Upload an offering memorandum to screen a real deal.
        </div>
      ) : null}

      <Link
        to="/pipeline"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{deal.property.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {deal.property.address} · {deal.property.units} units ·{" "}
            {deal.property.year_built ?? "Year built not stated in OM"}
          </p>
        </div>
        <RecommendationBadge value={deal.summary.recommendation} />
      </header>

      <div className="mt-8 space-y-10">
        <section>
          <SectionHeading
            title="Key metrics"
            description="Hover any card for a plain-English explanation and the OM source page."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="NOI"
              metric={m.noi}
              format={fmtMoney}
              explain="Net operating income: rental income left after operating costs, before any loan payments."
            />
            <MetricCard
              label="Cap rate"
              metric={m.cap_rate}
              format={pct}
              explain="NOI divided by price. A rough yield on an all-cash purchase — higher means cheaper."
            />
            <MetricCard
              label="DSCR"
              metric={m.dscr}
              format={x}
              explain="Debt service coverage: income divided by loan payments. 1.25x means 25% more income than the mortgage needs."
            />
            <MetricCard
              label="IRR"
              metric={m.irr}
              format={pct}
              explain="Internal rate of return: the annualized return over the hold, counting cash flow and sale proceeds."
            />
            <MetricCard
              label="Occupancy"
              metric={m.occupancy}
              format={pct}
              explain="Share of units physically occupied today."
            />
            <MetricCard
              label="Price / unit"
              metric={m.price_per_unit}
              format={(n) => `$${Math.round(n).toLocaleString()}`}
              explain="Purchase price divided by unit count — the fastest way to compare deals."
            />
            <MetricCard
              label="LTV"
              metric={m.ltv}
              format={pct}
              explain="Loan-to-value: how much of the price is borrowed. Higher means more leverage and more risk."
            />
            <MetricCard
              label="Debt yield"
              metric={m.debt_yield}
              format={pct}
              explain="NOI divided by loan amount. Lenders use it as a floor regardless of rates."
            />
            <MetricCard
              label="Expense ratio"
              metric={m.expense_ratio}
              format={pct}
              explain="Operating costs as a share of income. Lower is more efficient."
            />
            <MetricCard
              label="Breakeven occ."
              metric={m.breakeven_occupancy}
              format={pct}
              explain="Occupancy needed to cover costs and debt. The gap to actual occupancy is your cushion."
            />
            <MetricCard
              label="Rent / income"
              metric={m.rent_to_income}
              format={pct}
              explain="Share of a typical tenant's income spent on rent. Above 30% signals affordability strain."
            />
          </div>
        </section>

        <DealTerms deal={deal} onDealUpdate={setDeal} />
        <BidSensitivity deal={deal} />
        <RiskPanel deal={deal} />
        <MarketResearch deal={deal} />
        <InvestmentSummary deal={deal} />
      </div>

      <DealChat deal={deal} />
    </AppShell>
  );
}
