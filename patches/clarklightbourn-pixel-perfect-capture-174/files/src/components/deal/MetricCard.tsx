import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Metric } from "@/lib/deal-types";
import type { MetricBasis } from "@/lib/metric-basis";
import { NotInOm } from "./primitives";

export function MetricCard({
  label,
  metric,
  format,
  explain,
  emphasis = "secondary",
  basis = "om",
  basisNote,
}: {
  label: string;
  metric: Metric;
  format: (n: number) => string;
  explain: string;
  /** Primary metrics are what a PM looks at before anything else. */
  emphasis?: "primary" | "secondary";
  /** OM = from the offering; Modeled = assumed bid / debt / hold. */
  basis?: MetricBasis;
  basisNote?: string;
}) {
  const missing = metric.value === null;
  const showModeled = !missing && basis === "modeled";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "card-surface text-left transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-md",
            emphasis === "primary" ? "p-5" : "p-4",
            missing && "opacity-70",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
              {label}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {showModeled ? (
                <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-warn-foreground uppercase">
                  Modeled
                </span>
              ) : null}
              {metric.page && !missing && !showModeled ? (
                <sup className="rounded bg-secondary px-1 text-[10px] font-semibold text-muted-foreground">
                  p.{metric.page}
                </sup>
              ) : null}
            </div>
          </div>
          <div className="mt-2">
            {missing ? (
              <NotInOm />
            ) : (
              <span
                className={cn(
                  "num font-semibold tracking-tight",
                  emphasis === "primary" ? "text-3xl" : "text-2xl",
                )}
              >
                {format(metric.value as number)}
              </span>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs leading-relaxed">{explain}</p>
        {!missing ? (
          <p className="mt-1 text-[11px] opacity-80">
            {showModeled
              ? basisNote ||
                "Modeled — not a figure stated in the OM; uses assumed bid / financing / hold."
              : metric.page
                ? `Source: OM page ${metric.page}`
                : "Source: OM extract"}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
