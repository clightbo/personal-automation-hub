import { fmtMoney } from "@/lib/deal-types";
import type { Deal } from "@/lib/deal-types";
import { RecommendationBadge } from "./primitives";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pass" | "warn" | "critical" | "default";
}) {
  const toneClass =
    tone === "pass"
      ? "text-pass"
      : tone === "warn"
        ? "text-warn-foreground"
        : tone === "critical"
          ? "text-critical"
          : "text-foreground";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className={`num mt-1 truncate text-lg font-semibold tracking-tight ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function riskTone(score: number): "pass" | "warn" | "critical" {
  if (score >= 70) return "critical";
  if (score >= 40) return "warn";
  return "pass";
}

/** First-viewport IC brief: recommendation, thesis, and the numbers that kill or clear a deal. */
export function DealBrief({ deal }: { deal: Deal }) {
  const asking = deal.deal_terms.stated_price;
  const risk = deal.summary.risk_score;
  const confidence = Math.round(deal.extraction_meta.confidence * 100);

  return (
    <section id="overview" className="deal-brief animate-rise">
      <div className="deal-brief__glow" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Investment committee brief · screened {deal.screened_on}
          </p>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {deal.property.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {deal.property.address}
            <span className="mx-2 text-border">·</span>
            {deal.property.units} units
            <span className="mx-2 text-border">·</span>
            {deal.property.year_built ?? "Vintage n/a"}
            <span className="mx-2 text-border">·</span>
            {deal.property.submarket}
          </p>
        </div>
        <RecommendationBadge value={deal.summary.recommendation} />
      </div>

      <p className="font-display mt-5 max-w-4xl text-lg leading-snug text-foreground/90 text-pretty sm:text-xl">
        {deal.narrative.headline}
      </p>
      <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">
        {deal.narrative.executive_summary}
      </p>

      <div className="mt-6 grid gap-4 border-t border-border/80 pt-5 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Risk score" value={`${risk} / 100`} tone={riskTone(risk)} />
        <Stat
          label="Flags"
          value={`${deal.summary.critical} critical · ${deal.summary.high} high`}
          tone={
            deal.summary.critical > 0
              ? "critical"
              : deal.summary.high > 0
                ? "warn"
                : "pass"
          }
        />
        <Stat
          label="Guidance / ask"
          value={asking == null ? "Unpriced" : fmtMoney(asking)}
        />
        <Stat
          label="Max supportable"
          value={fmtMoney(deal.max_supportable_price)}
          tone="pass"
        />
        <Stat
          label="Extraction confidence"
          value={`${confidence}% · ${deal.extraction_meta.source_pages} pp`}
        />
      </div>
    </section>
  );
}
