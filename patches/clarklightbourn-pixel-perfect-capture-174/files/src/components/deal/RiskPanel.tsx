import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { SeverityPill, SectionHeading } from "./primitives";
import type { Deal, RiskFlag } from "@/lib/deal-types";
import { cn } from "@/lib/utils";

function Gauge({ score }: { score: number }) {
  const tone =
    score >= 70 ? "text-critical" : score >= 40 ? "text-warn" : "text-pass";
  const stroke =
    score >= 70 ? "var(--critical)" : score >= 40 ? "var(--warn)" : "var(--pass)";
  const r = 52;
  const c = Math.PI * r;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 130 74" className="h-20 w-36">
        <path
          d="M 13 65 A 52 52 0 0 1 117 65"
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 13 65 A 52 52 0 0 1 117 65"
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <div>
        <p className={cn("num text-3xl font-semibold", tone)}>{score}</p>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          Risk score / 100
        </p>
      </div>
    </div>
  );
}

function FlagCard({ flag }: { flag: RiskFlag }) {
  const [open, setOpen] = useState(flag.severity === "CRITICAL");
  const accent =
    flag.severity === "CRITICAL"
      ? "border-l-critical"
      : flag.severity === "HIGH"
        ? "border-l-warn"
        : flag.severity === "PASS"
          ? "border-l-pass"
          : "border-l-unknown";
  return (
    <div className={cn("card-surface border-l-4 overflow-hidden", accent)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="font-medium">{flag.rule}</span>
        <span className="flex items-center gap-3">
          <SeverityPill severity={flag.severity} />
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </span>
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-border px-4 py-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  Observed
                </p>
                <p className="num mt-1 font-medium">
                  {flag.observed ?? "Not stated in OM"}
                </p>
              </div>
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  Threshold
                </p>
                <p className="mt-1 text-muted-foreground">{flag.threshold}</p>
              </div>
            </div>
            <p className="leading-relaxed">{flag.reason}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, UNKNOWN: 2, PASS: 3 } as const;

export function RiskPanel({ deal }: { deal: Deal }) {
  const flags = [...deal.flags].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <section id="risk" className="animate-rise">
      <SectionHeading
        title="Risk & kill criteria"
        description={`${deal.summary.critical} critical · ${deal.summary.high} high · ${deal.summary.unknown} unknown — critical flags first`}
      />
      <div className="card-surface mb-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Gauge score={deal.summary.risk_score} />
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {deal.summary.rationale}
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {flags.map((f) => (
          <FlagCard key={f.id} flag={f} />
        ))}
      </div>
    </section>
  );
}