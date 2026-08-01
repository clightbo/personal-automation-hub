import { AlertTriangle, Check, X } from "lucide-react";
import { SectionHeading } from "./primitives";
import { fmtMoney } from "@/lib/deal-types";
import type { Deal } from "@/lib/deal-types";
import { cn } from "@/lib/utils";

export function BidSensitivity({
  deal,
  selectedBid,
  onSelectBid,
}: {
  deal: Deal;
  /** Bid currently driving the headline metrics (cap / DSCR / etc.). */
  selectedBid?: number | null;
  /** Click a ladder row to recompute underwriting snapshot metrics. */
  onSelectBid?: (bidPrice: number) => void;
}) {
  const active =
    selectedBid ??
    deal.bid_sensitivity.find(
      (r) =>
        r.cap_rate != null &&
        deal.metrics.cap_rate.value != null &&
        Math.abs(r.cap_rate - deal.metrics.cap_rate.value) < 0.02 &&
        r.dscr != null &&
        deal.metrics.dscr.value != null &&
        Math.abs(r.dscr - deal.metrics.dscr.value) < 0.02,
    )?.bid_price ??
    null;

  return (
    <section id="bid-sensitivity" className="animate-rise">
      <SectionHeading
        title="Bid sensitivity"
        description="Click a row to set that bid — cap rate, DSCR, debt yield, and $/unit update in the snapshot above."
      />
      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-primary p-5 text-primary-foreground">
          <div>
            <p className="text-xs tracking-widest uppercase opacity-70">
              Maximum supportable price
            </p>
            <p className="num mt-1 text-3xl font-semibold">
              {fmtMoney(deal.max_supportable_price)}
            </p>
          </div>
          <p className="max-w-sm text-xs leading-relaxed opacity-80">
            The highest bid at which the asset still clears the minimum DSCR and
            debt yield tests at the assumed leverage and rate.
          </p>
        </div>
        <p className="border-b border-border bg-warn-soft/50 px-4 py-2 text-[11px] leading-relaxed text-warn-foreground">
          Modeled ladder — not OM guidance. Click any bid to drive the headline
          metrics. Rows use assumed LTV, rate, and amort.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-3 font-medium">Bid price</th>
                <th className="px-4 py-3 font-medium">$/Unit</th>
                <th className="px-4 py-3 font-medium">Cap rate</th>
                <th className="px-4 py-3 font-medium">DSCR</th>
                <th className="px-4 py-3 font-medium">Debt yield</th>
                <th className="px-4 py-3 font-medium">Financeable</th>
              </tr>
            </thead>
            <tbody>
              {deal.bid_sensitivity.map((r) => {
                const isActive = active != null && r.bid_price === active;
                const clickable = Boolean(onSelectBid);
                return (
                  <tr
                    key={r.bid_price}
                    onClick={() => onSelectBid?.(r.bid_price)}
                    onKeyDown={(e) => {
                      if (!onSelectBid) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectBid(r.bid_price);
                      }
                    }}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? "button" : undefined}
                    aria-pressed={clickable ? isActive : undefined}
                    className={cn(
                      "border-b border-border/70 last:border-0",
                      r.negative_leverage && "bg-warn-soft/60",
                      !r.financeable && "opacity-80",
                      clickable &&
                        "cursor-pointer transition-colors hover:bg-secondary/80 focus-visible:bg-secondary/80 focus-visible:outline-none",
                      isActive && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    <td className="num px-4 py-3 font-semibold">
                      {fmtMoney(r.bid_price)}
                      {isActive ? (
                        <span className="ml-2 text-[11px] font-medium text-primary">
                          Selected
                        </span>
                      ) : null}
                      {r.note ? (
                        <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                          {r.note}
                        </span>
                      ) : null}
                      {r.negative_leverage ? (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-normal text-warn-foreground">
                          <AlertTriangle className="h-3 w-3" />
                          cap rate below cost of debt — leverage reduces returns
                        </span>
                      ) : null}
                    </td>
                    <td className="num px-4 py-3">
                      ${r.price_per_unit.toLocaleString()}
                    </td>
                    <td className="num px-4 py-3">{r.cap_rate?.toFixed(2)}%</td>
                    <td className="num px-4 py-3">{r.dscr?.toFixed(2)}x</td>
                    <td className="num px-4 py-3">{r.debt_yield?.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      {r.financeable ? (
                        <Check className="h-4 w-4 text-pass" />
                      ) : (
                        <X className="h-4 w-4 text-critical" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
