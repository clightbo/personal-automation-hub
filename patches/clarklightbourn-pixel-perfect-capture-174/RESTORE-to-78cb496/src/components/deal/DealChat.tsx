import { useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtMoney, fmtPct } from "@/lib/deal-types";
import type { Deal } from "@/lib/deal-types";

type Msg = { role: "user" | "assistant"; text: string; pages?: number[] };

const metricLine = (
  label: string,
  value: number | null | undefined,
  format: (n: number) => string,
  missing = "Not stated in the OM / not yet modeled.",
) => (value == null ? `${label}: ${missing}` : `${label}: ${format(value)}`);

function answerFor(deal: Deal, q: string): Msg {
  const l = q.toLowerCase().trim();
  const m = deal.metrics;
  const pages = (...vals: Array<number | undefined>) => {
    const p = vals.filter((v): v is number => typeof v === "number");
    return p.length ? p : undefined;
  };

  // DSCR / coverage / debt service
  if (
    l.includes("dscr") ||
    l.includes("coverage") ||
    (l.includes("debt") && (l.includes("service") || l.includes("cover")))
  ) {
    const text =
      m.dscr.value == null
        ? "DSCR is not in the OM as a stated figure. Enter a bid under Deal terms and re-run sensitivity to compute coverage from NOI and assumed debt."
        : `Modeled DSCR is ${m.dscr.value.toFixed(2)}x at ${m.ltv.value ?? "—"}% LTV` +
          (m.debt_yield.value != null
            ? ` with debt yield ${fmtPct(m.debt_yield.value)}.`
            : ".") +
          ` Max supportable bid under current floors is ${fmtMoney(deal.max_supportable_price)}.`;
    return { role: "assistant", text, pages: pages(m.dscr.page, m.noi.page) };
  }

  // Cap rate / yield
  if (l.includes("cap rate") || l.includes("caprate") || /\bcap\b/.test(l)) {
    const text =
      m.cap_rate.value == null
        ? "Cap rate needs a purchase price. Use Deal terms to set a bid; it will compute NOI ÷ bid."
        : `Cap rate is ${fmtPct(m.cap_rate.value)}` +
          (m.noi.value != null ? ` on NOI of ${fmtMoney(m.noi.value)}.` : ".");
    return { role: "assistant", text, pages: pages(m.cap_rate.page, m.noi.page) };
  }

  // NOI / income
  if (l.includes("noi") || l.includes("net operating") || l.includes("operating income")) {
    const text =
      m.noi.value == null
        ? "NOI was not extracted from the OM."
        : `In-place / modeled NOI is ${fmtMoney(m.noi.value)}` +
          (m.expense_ratio.value != null
            ? ` with an expense ratio of ${fmtPct(m.expense_ratio.value)}.`
            : ".");
    return { role: "assistant", text, pages: pages(m.noi.page) };
  }

  // Occupancy
  if (l.includes("occupanc") || l.includes("vacant") || l.includes("vacancy")) {
    const text =
      m.occupancy.value == null
        ? "Occupancy was not stated in the OM extract."
        : `Physical occupancy is ${fmtPct(m.occupancy.value)}.` +
          (m.breakeven_occupancy.value != null
            ? ` Estimated breakeven occupancy is ${fmtPct(m.breakeven_occupancy.value)}.`
            : "");
    return { role: "assistant", text, pages: pages(m.occupancy.page) };
  }

  // Price / bid / supportable
  if (
    l.includes("price") ||
    l.includes("bid") ||
    l.includes("supportable") ||
    l.includes("how much") ||
    l.includes("asking")
  ) {
    const ask =
      deal.deal_terms.stated_price == null
        ? "The OM is unpriced."
        : `OM guidance / ask is ${fmtMoney(deal.deal_terms.stated_price)}.`;
    const text = `${ask} ${deal.deal_terms.note} Maximum supportable under current debt floors is ${fmtMoney(deal.max_supportable_price)}.` +
      (m.price_per_unit.value != null
        ? ` Current modeled price/unit is $${Math.round(m.price_per_unit.value).toLocaleString()}.`
        : "");
    return {
      role: "assistant",
      text,
      pages: pages(deal.deal_terms.stated_price_page),
    };
  }

  // LTV / leverage / debt yield / rate
  if (l.includes("ltv") || l.includes("leverage") || l.includes("loan-to-value")) {
    const text =
      m.ltv.value == null
        ? "LTV is an assumption in Deal terms (default 60% when not in the OM)."
        : `Modeled LTV is ${fmtPct(m.ltv.value)}.` +
          (m.debt_yield.value != null ? ` Debt yield is ${fmtPct(m.debt_yield.value)}.` : "");
    return { role: "assistant", text, pages: pages(m.ltv.page) };
  }
  if (l.includes("debt yield") || l.includes("debt-yield")) {
    const text =
      m.debt_yield.value == null
        ? "Debt yield appears after a bid and LTV are set (NOI ÷ loan)."
        : `Debt yield is ${fmtPct(m.debt_yield.value)}.`;
    return { role: "assistant", text, pages: pages(m.debt_yield.page, m.noi.page) };
  }

  // IRR
  if (l.includes("irr") || l.includes("internal rate")) {
    const text =
      m.irr.value == null
        ? "IRR is not in this extract. It needs a hold-period model (growth, exit cap, capex, sale) from n8n — the site will not invent it."
        : `Modeled IRR is ${fmtPct(m.irr.value)}.`;
    return { role: "assistant", text, pages: pages(m.irr.page) };
  }

  // Breakeven
  if (l.includes("breakeven") || l.includes("break-even") || l.includes("break even")) {
    const text =
      m.breakeven_occupancy.value == null
        ? "Breakeven occupancy is not available yet. It needs expense ratio + a modeled debt service."
        : `Estimated breakeven occupancy is ${fmtPct(m.breakeven_occupancy.value)}` +
          (m.occupancy.value != null
            ? ` vs in-place occupancy ${fmtPct(m.occupancy.value)}.`
            : ".");
    return { role: "assistant", text, pages: pages(m.breakeven_occupancy.page) };
  }

  // Rent / income / affordability
  if (
    l.includes("rent to income") ||
    l.includes("rent-to-income") ||
    l.includes("affordab") ||
    (l.includes("rent") && l.includes("income"))
  ) {
    const flag = deal.flags.find((f) => /afford/i.test(f.rule));
    const text =
      m.rent_to_income.value == null
        ? "Rent-to-income was not extracted. That usually needs census/AMI market data in n8n."
        : `Rent-to-income is ${fmtPct(m.rent_to_income.value)}.` +
          (flag ? ` Risk flag: ${flag.severity} — ${flag.reason}` : "");
    return { role: "assistant", text, pages: pages(m.rent_to_income.page) };
  }

  // Capex / reserves / capital / PCA / vintage
  if (
    l.includes("capex") ||
    l.includes("capital") ||
    l.includes("reserve") ||
    l.includes("pca") ||
    l.includes("condition") ||
    l.includes("renovat") ||
    l.includes("vintage") ||
    l.includes("year built")
  ) {
    const flag = deal.flags.find((f) => /capital|capex|condition|needs/i.test(f.rule));
    const year = deal.property.year_built;
    const parts = [
      year != null ? `Year built: ${year}.` : "Year built not stated.",
      flag
        ? `${flag.rule} is ${flag.severity}: ${flag.reason}`
        : "No capital-needs flag was raised in this screen.",
      deal.narrative.key_concerns.find((c) => /capex|capital|reserve|renovat|pca|vintage/i.test(c)) ??
        "",
    ].filter(Boolean);
    return { role: "assistant", text: parts.join(" ") };
  }

  // Units / size / address / submarket
  if (l.includes("unit") || l.includes("how big") || l.includes("size")) {
    return {
      role: "assistant",
      text: `${deal.property.name} is ${deal.property.units} units` +
        (deal.property.year_built != null ? `, built ${deal.property.year_built}` : "") +
        (deal.property.submarket && deal.property.submarket !== "—"
          ? `, in ${deal.property.submarket}.`
          : "."),
    };
  }
  if (l.includes("address") || l.includes("where") || l.includes("location") || l.includes("submarket")) {
    return {
      role: "assistant",
      text: `Address: ${deal.property.address}. Submarket: ${deal.property.submarket}.`,
    };
  }

  // Risk / recommendation / go no-go
  if (
    l.includes("risk") ||
    l.includes("flag") ||
    l.includes("recommend") ||
    l.includes("go or") ||
    l.includes("no-go") ||
    l.includes("nogo") ||
    /\bgo\b/.test(l)
  ) {
    const highs = deal.flags.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL");
    const flagLines = highs.length
      ? highs.map((f) => `• ${f.rule} (${f.severity}): ${f.reason}`).join("\n")
      : "No HIGH/CRITICAL flags.";
    return {
      role: "assistant",
      text: `Recommendation: ${deal.summary.recommendation}. Risk score ${deal.summary.risk_score}/100 (${deal.summary.critical} critical, ${deal.summary.high} high).\n${deal.summary.rationale}\n${flagLines}`,
    };
  }

  // Market / comps / supply
  if (l.includes("market") || l.includes("comp") || l.includes("supply") || l.includes("delivery")) {
    const comps = deal.market.comps;
    const supply = deal.market.supply;
    if (!comps.length && !supply.length) {
      return {
        role: "assistant",
        text: "Market research is empty in this result — n8n did not return comps or supply. The memo may still mention market color in narrative, but the Market panel has no structured data yet.",
      };
    }
    const compLine = comps.length
      ? `Comps (${comps.length}): ${comps
          .slice(0, 3)
          .map((c) => `${c.property} ($${c.avg_rent}/mo, ${c.occupancy}% occ)`)
          .join("; ")}.`
      : "No rent comps.";
    const supplyLine = supply.length
      ? `Supply sample: ${supply.map((s) => `${s.year}: ${s.deliveries} units (${s.stock_pct}% stock)`).join("; ")}.`
      : "No supply pipeline rows.";
    return { role: "assistant", text: `${compLine} ${supplyLine}` };
  }

  // Strengths / concerns / next steps / questions
  if (l.includes("strength") || l.includes("positive") || l.includes("why buy")) {
    return {
      role: "assistant",
      text: deal.narrative.key_strengths.length
        ? deal.narrative.key_strengths.map((s) => `• ${s}`).join("\n")
        : "No key strengths were returned.",
    };
  }
  if (l.includes("concern") || l.includes("risks") || l.includes("weakness") || l.includes("negative")) {
    return {
      role: "assistant",
      text: deal.narrative.key_concerns.length
        ? deal.narrative.key_concerns.map((s) => `• ${s}`).join("\n")
        : "No key concerns were returned.",
    };
  }
  if (l.includes("next step") || l.includes("what should") || l.includes("diligence")) {
    return {
      role: "assistant",
      text: deal.narrative.recommended_next_steps.length
        ? deal.narrative.recommended_next_steps.map((s) => `• ${s}`).join("\n")
        : "No next steps were returned.",
    };
  }
  if (l.includes("question") || l.includes("ask the broker") || l.includes("broker")) {
    return {
      role: "assistant",
      text: deal.narrative.critical_questions.length
        ? deal.narrative.critical_questions.map((s) => `• ${s}`).join("\n")
        : "No broker questions were returned.",
    };
  }

  // Expense ratio
  if (l.includes("expense")) {
    return {
      role: "assistant",
      text: metricLine("Expense ratio", m.expense_ratio.value, fmtPct),
      pages: pages(m.expense_ratio.page),
    };
  }

  // Snapshot of key metrics (explicit ask)
  if (l.includes("metric") || l.includes("summary of numbers") || l.includes("key number")) {
    const text = [
      metricLine("NOI", m.noi.value, fmtMoney),
      metricLine("Cap rate", m.cap_rate.value, fmtPct),
      metricLine("DSCR", m.dscr.value, (n) => `${n.toFixed(2)}x`),
      metricLine("Debt yield", m.debt_yield.value, fmtPct),
      metricLine("Occupancy", m.occupancy.value, fmtPct),
      metricLine("IRR", m.irr.value, fmtPct, "Not modeled yet (needs n8n hold-period run)."),
      `Max supportable: ${fmtMoney(deal.max_supportable_price)}`,
    ].join("\n");
    return { role: "assistant", text };
  }

  // Fallback: short headline + point them to specific topics — NOT the full memo dump
  return {
    role: "assistant",
    text:
      `${deal.narrative.headline}\n\n` +
      `I can answer specifics from this screen — try asking about DSCR, cap rate, NOI, bid / max supportable, occupancy, capex, risks, strengths, comps/supply, or next steps.\n\n` +
      `Recommendation: ${deal.summary.recommendation}.`,
  };
}

export function DealChat({ deal }: { deal: Deal }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: `Ask a specific question about ${deal.property.name} — e.g. “What’s the DSCR?”, “Any capex flags?”, “What’s max supportable?”.`,
    },
  ]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setMessages((msgs) => [...msgs, { role: "user", text: q }, answerFor(deal, q)]);
    setInput("");
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 shadow-lg print:hidden"
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        Ask the OM
      </Button>
    );
  }

  return (
    <aside className="fixed top-0 right-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-xl print:hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">OM Assistant</p>
          <p className="text-xs text-muted-foreground">{deal.property.name}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close chat">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
              msg.role === "user"
                ? "ml-8 bg-primary text-primary-foreground"
                : "mr-4 bg-secondary text-secondary-foreground"
            }`}
          >
            {msg.text}
            {msg.pages?.length ? (
              <p className="mt-2 text-[11px] opacity-70">
                Source: OM p.{msg.pages.join(", p.")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What’s the modeled DSCR?"
        />
        <Button type="submit" size="icon" aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}
