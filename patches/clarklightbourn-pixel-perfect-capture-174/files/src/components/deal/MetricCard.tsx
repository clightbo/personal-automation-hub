import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Metric } from "@/lib/deal-types";
import { NotInOm } from "./primitives";

export function MetricCard({
  label,
  metric,
  format,
  explain,
  emphasis = "secondary",
}: {
  label: string;
  metric: Metric;
  format: (n: number) => string;
  explain: string;
  /** Primary metrics are what a PM looks at before anything else. */
  emphasis?: "primary" | "secondary";
}) {
  const missing = metric.value === null;
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
            {metric.page && !missing ? (
              <sup className="rounded bg-secondary px-1 text-[10px] font-semibold text-muted-foreground">
                p.{metric.page}
              </sup>
            ) : null}
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
        {metric.page && !missing ? (
          <p className="mt-1 text-[11px] opacity-80">Source: OM page {metric.page}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
