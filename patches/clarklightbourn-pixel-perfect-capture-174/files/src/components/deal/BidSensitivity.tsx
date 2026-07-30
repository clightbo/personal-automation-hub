import { AlertTriangle, Check, X } from "lucide-react";
import { SectionHeading } from "./primitives";
import { fmtMoney } from "@/lib/deal-types";
import type { Deal } from "@/lib/deal-types";
import { cn } from "@/lib/utils";

export function BidSensitivity({ deal }: { deal: Deal }) {
  return (
    <section id="bid-sensitivity" className="animate-rise">
      <SectionHeading
        title="Bid sensitivity"
        description="Where the bid still clears DSCR and debt-yield floors — and where leverage turns negative."
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
              {deal.bid_sensitivity.map((r) => (
                <tr
                  key={r.bid_price}
                  className={cn(
                    "border-b border-border/70 last:border-0",
                    r.negative_leverage && "bg-warn-soft/60",
                    !r.financeable && "opacity-80",
                  )}
                >
                  <td className="num px-4 py-3 font-semibold">
                    {fmtMoney(r.bid_price)}
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}