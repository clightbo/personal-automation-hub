import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyBidAssumptions, parseAssumptions } from "@/lib/bid-math";
import type { Deal } from "@/lib/deal-types";
import { SectionHeading } from "./primitives";

export function DealTerms({
  deal,
  selectedBid,
  onDealUpdate,
  onBidChange,
}: {
  deal: Deal;
  /** Bid selected from the ladder (keeps this form in sync). */
  selectedBid?: number | null;
  onDealUpdate?: (deal: Deal) => void;
  onBidChange?: (bid: number) => void;
}) {
  const priced = deal.deal_terms.stated_price !== null;
  const defaultBid = priced
    ? deal.deal_terms.stated_price
    : deal.max_supportable_price ||
      deal.bid_sensitivity.find((r) => r.financeable)?.bid_price ||
      deal.bid_sensitivity[0]?.bid_price ||
      "";
  const [terms, setTerms] = useState({
    bid: String(defaultBid ?? ""),
    ltv: String(deal.metrics.ltv.value ?? 60),
    rate: "6.5",
    amort: "30",
    minDscr: "1.25",
    minDy: "9",
  });
  const set = (k: keyof typeof terms) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setTerms((t) => ({ ...t, [k]: e.target.value }));

  useEffect(() => {
    if (selectedBid != null && selectedBid > 0) {
      setTerms((t) => (t.bid === String(selectedBid) ? t : { ...t, bid: String(selectedBid) }));
    }
  }, [selectedBid]);

  const rerun = () => {
    const assumptions = parseAssumptions(terms);
    if (!assumptions) {
      toast.error("Enter valid numbers for bid, LTV, rate, and underwriting floors.");
      return;
    }
    if (deal.metrics.noi.value == null) {
      toast.error("NOI is missing — sensitivity cannot be recomputed.");
      return;
    }
    const updated = applyBidAssumptions(deal, assumptions);
    onBidChange?.(assumptions.bid);
    onDealUpdate?.(updated);
    const el = document.getElementById("bid-sensitivity");
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top, behavior: "smooth" });
    }
    toast.success("Metrics updated for this bid.");
  };

  return (
    <section id="deal-terms">
      <SectionHeading title="Deal terms" description={deal.deal_terms.offering_type} />
      <div className="card-surface p-5">
        <div
          className={`mb-5 rounded-md border p-3 text-sm ${
            priced
              ? "border-border bg-secondary text-foreground"
              : "border-warn/40 bg-warn-soft text-warn-foreground"
          }`}
        >
          {priced
            ? deal.deal_terms.note
            : "The OM did not state a price. Enter a bid, or click a row on the bid ladder — cap, DSCR, and related metrics will update."}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            id="bid"
            label="Bid price ($)"
            hint={priced ? `from OM p.${deal.deal_terms.stated_price_page}` : undefined}
            value={terms.bid}
            onChange={set("bid")}
          />
          <Field id="ltv" label="LTV (%)" value={terms.ltv} onChange={set("ltv")} />
          <Field id="rate" label="Interest rate (%)" value={terms.rate} onChange={set("rate")} />
          <Field id="amort" label="Amortization (years)" value={terms.amort} onChange={set("amort")} />
          <Field id="minDscr" label="Min DSCR (x)" value={terms.minDscr} onChange={set("minDscr")} />
          <Field id="minDy" label="Min debt yield (%)" value={terms.minDy} onChange={set("minDy")} />
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={rerun}>Update metrics</Button>
        </div>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      <Input id={id} inputMode="decimal" value={value} onChange={onChange} className="num" />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
