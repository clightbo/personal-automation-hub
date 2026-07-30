import { cn } from "@/lib/utils";
import type { Recommendation, Severity } from "@/lib/deal-types";

export function SeverityPill({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    CRITICAL: "bg-critical text-critical-foreground",
    HIGH: "bg-warn text-warn-foreground",
    PASS: "bg-pass text-pass-foreground",
    UNKNOWN: "bg-unknown-soft text-muted-foreground border border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase",
        styles[severity],
      )}
    >
      {severity}
    </span>
  );
}

export function RecommendationBadge({
  value,
  size = "lg",
}: {
  value: Recommendation;
  size?: "sm" | "lg";
}) {
  const styles: Record<Recommendation, string> = {
    GO: "bg-pass text-pass-foreground",
    "GO WITH CONDITIONS": "bg-pass-soft text-pass border border-pass/30",
    CONDITIONAL: "bg-warn text-warn-foreground",
    "NO-GO": "bg-critical text-critical-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-semibold tracking-wide uppercase",
        size === "lg" ? "px-4 py-2 text-sm" : "px-2 py-0.5 text-[11px]",
        styles[value],
      )}
    >
      {value}
    </span>
  );
}

export function NotInOm({ label = "Not stated in OM" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-unknown-soft px-2 py-1 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}