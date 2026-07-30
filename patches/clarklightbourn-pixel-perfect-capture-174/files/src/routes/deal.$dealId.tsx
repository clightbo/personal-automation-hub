import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BidSensitivity } from "@/components/deal/BidSensitivity";
import { DealBrief } from "@/components/deal/DealBrief";
import { DealChat } from "@/components/deal/DealChat";
import { DealSectionNav } from "@/components/deal/DealSectionNav";
import { DealTerms } from "@/components/deal/DealTerms";
import { InvestmentSummary } from "@/components/deal/InvestmentSummary";
import { MarketResearch } from "@/components/deal/MarketResearch";
import { MetricCard } from "@/components/deal/MetricCard";
import { RiskPanel } from "@/components/deal/RiskPanel";
import { SectionHeading } from "@/components/deal/primitives";
import { fmtMoney } from "@/lib/deal-types";
import { getDeal } from "@/lib/mock-deals";
import { getScreeningResult, saveScreeningResult } from "@/lib/screening-result";

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
          <h1 className="font-display text-2xl font-semibold">Screening result not found</h1>
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

  return (
    <AppShell>
      <Link
        to="/pipeline"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> Back to pipeline
      </Link>

      <DealBrief deal={deal} />
      <DealSectionNav />

      <div className="space-y-12">
        <section id="key-metrics" className="animate-rise">
          <SectionHeading
            title="Underwriting snapshot"
            description="The six numbers a portfolio manager checks before reading the rest of the OM."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Cap rate"
              metric={m.cap_rate}
              format={pct}
              emphasis="primary"
              explain="NOI divided by price. A rough yield on an all-cash purchase — higher means cheaper."
            />
            <MetricCard
              label="DSCR"
              metric={m.dscr}
              format={x}
              emphasis="primary"
              explain="Debt service coverage: income divided by loan payments. 1.25x means 25% more income than the mortgage needs."
            />
            <MetricCard
              label="Debt yield"
              metric={m.debt_yield}
              format={pct}
              emphasis="primary"
              explain="NOI divided by loan amount. Lenders use it as a floor regardless of rates."
            />
            <MetricCard
              label="NOI"
              metric={m.noi}
              format={fmtMoney}
              emphasis="primary"
              explain="Net operating income: rental income left after operating costs, before any loan payments."
            />
            <MetricCard
              label="Price / unit"
              metric={m.price_per_unit}
              format={(n) => `$${Math.round(n).toLocaleString()}`}
              emphasis="primary"
              explain="Purchase price divided by unit count — the fastest way to compare deals."
            />
            <MetricCard
              label="Occupancy"
              metric={m.occupancy}
              format={pct}
              emphasis="primary"
              explain="Share of units physically occupied today."
            />
          </div>

          <div className="mt-6">
            <p className="mb-3 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              Secondary metrics
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <MetricCard
                label="IRR"
                metric={m.irr}
                format={pct}
                explain="Internal rate of return: the annualized return over the hold, counting cash flow and sale proceeds."
              />
              <MetricCard
                label="LTV"
                metric={m.ltv}
                format={pct}
                explain="Loan-to-value: how much of the price is borrowed. Higher means more leverage and more risk."
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
          </div>
        </section>

        <RiskPanel deal={deal} />

        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-start">
          <DealTerms
            deal={deal}
            onDealUpdate={(next) => {
              setDeal(saveScreeningResult(next));
            }}
          />
          <BidSensitivity deal={deal} />
        </div>

        <MarketResearch deal={deal} />
        <InvestmentSummary deal={deal} />
      </div>

      <DealChat deal={deal} />
    </AppShell>
  );
}
