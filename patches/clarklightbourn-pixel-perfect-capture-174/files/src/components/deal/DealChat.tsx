import { useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Deal } from "@/lib/deal-types";
import { fmtMoney } from "@/lib/deal-types";

type Msg = { role: "user" | "assistant"; text: string; pages?: number[] };

const pctOrNull = (v: number | null, d = 1) => (v === null ? null : `${v.toFixed(d)}%`);
const xOrNull = (v: number | null, d = 2) => (v === null ? null : `${v.toFixed(d)}x`);

const pagesFor = (page?: number): number[] | undefined =>
  typeof page === "number" && page > 0 ? [page] : undefined;

function answerFor(deal: Deal, q: string): Msg {
  const l = q.toLowerCase();
  const m = deal.metrics;

  if (l.includes("cap rate") || l.includes("cap ")) {
    const cap = pctOrNull(m.cap_rate.value);
    const noi = m.noi.value;
    if (cap && noi !== null) {
      return {
        role: "assistant",
        text: `Cap rate is ${cap} on NOI of ${fmtMoney(noi)}${
          deal.deal_terms.stated_price === null
            ? ` — computed at the max supportable price of ${fmtMoney(deal.max_supportable_price)}, since the OM is unpriced.`
            : "."
        }`,
        pages: pagesFor(m.cap_rate.page ?? m.noi.page),
      };
    }
    return {
      role: "assistant",
      text:
        "Cap rate can't be stated as a single number — the OM is unpriced. See the bid ladder: cap rate falls as the bid rises. NOI is " +
        (noi !== null ? fmtMoney(noi) : "not stated in the OM") +
        ".",
    };
  }

  if (l.includes("noi") || l.includes("net operating")) {
    return {
      role: "assistant",
      text:
        m.noi.value !== null
          ? `NOI is ${fmtMoney(m.noi.value)} (in-place / as stated in the OM).`
          : "NOI is not stated in the OM.",
      pages: pagesFor(m.noi.page),
    };
  }

  if (l.includes("dscr") || l.includes("coverage")) {
    const dscr = xOrNull(m.dscr.value);
    if (dscr) {
      return {
        role: "assistant",
        text: `DSCR is ${dscr} at the modeled bid and ${m.ltv.value ?? "—"}% LTV. This moves with the bid — see the bid ladder for coverage at each price.`,
        pages: pagesFor(m.dscr.page),
      };
    }
    return {
      role: "assistant",
      text: "DSCR isn't computable yet — the OM states no price or in-place debt. Enter a bid in Deal terms and the ladder shows coverage at each price.",
    };
  }

  if (l.includes("debt yield")) {
    const dy = pctOrNull(m.debt_yield.value);
    return {
      role: "assistant",
      text: dy
        ? `Debt yield is ${dy} at the modeled bid — NOI over loan amount.`
        : "Debt yield isn't computable until a bid and loan amount are set.",
    };
  }

  if (l.includes("occupanc")) {
    const occ = pctOrNull(m.occupancy.value);
    return {
      role: "assistant",
      text: occ ? `Physical occupancy is ${occ}.` : "Occupancy was not found in the OM.",
      pages: pagesFor(m.occupancy.page),
    };
  }

  if (l.includes("max") || l.includes("supportable")) {
    return {
      role: "assistant",
      text: `Maximum supportable price is ${fmtMoney(deal.max_supportable_price)} — the highest bid that still clears the minimum DSCR and debt-yield tests at the assumed leverage and rate.`,
    };
  }
  if (l.includes("price") || l.includes("bid") || l.includes("cost")) {
    const stated = deal.deal_terms.stated_price;
    return {
      role: "assistant",
      text:
        stated !== null
          ? `The OM states a price of ${fmtMoney(stated)}. Price per unit is ${
              m.price_per_unit.value !== null ? fmtMoney(m.price_per_unit.value) : "—"
            }.`
          : `${deal.deal_terms.note || "The OM is unpriced."} Max supportable price under the current debt assumptions is ${fmtMoney(deal.max_supportable_price)}.`,
      pages: pagesFor(deal.deal_terms.stated_price_page),
    };
  }

  if (l.includes("expense")) {
    const er = pctOrNull(m.expense_ratio.value);
    return {
      role: "assistant",
      text: er
        ? `Operating expense ratio is ${er} of effective gross income.`
        : "Expense ratio isn't available.",
    };
  }

  if (l.includes("capex") || l.includes("capital") || l.includes("reserve")) {
    const capex = deal.flags.find((f) => /capital|capex/i.test(f.rule));
    return {
      role: "assistant",
      text: capex
        ? `Capital Needs flag: ${capex.severity}. ${capex.reason}`
        : "No capital-needs flag was raised.",
    };
  }
  if (l.includes("risk") || l.includes("flag")) {
    const worst = deal.flags
      .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
      .map((f) => `${f.rule} (${f.severity})`)
      .join(", ");
    return {
      role: "assistant",
      text: `Risk score is ${deal.summary.risk_score}/100 — ${deal.summary.critical} critical, ${deal.summary.high} high, ${deal.summary.unknown} unknown. ${
        worst ? `Flagged: ${worst}. ` : ""
      }${deal.summary.rationale}`,
    };
  }

  if (l.includes("irr") || l.includes("return")) {
    const irr = pctOrNull(m.irr.value);
    return {
      role: "assistant",
      text: irr
        ? `Modeled levered IRR is ${irr} over the assumed hold.`
        : "IRR isn't stated in the OM and isn't computed for an unpriced deal until a bid and debt terms are set.",
    };
  }

  return {
    role: "assistant",
    text:
      deal.narrative.executive_summary ||
      `Ask about cap rate, NOI, DSCR, debt yield, occupancy, max supportable price, capex, or risk flags for ${deal.property.name}.`,
  };
}

export function DealChat({ deal }: { deal: Deal }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: `Ask a specific question about ${deal.property.name} — e.g. "What's the DSCR?", "Any capex flags?", "What's max supportable?". Answers read the screened figures directly.`,
    },
  ]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    setMessages((mm) => [...mm, { role: "user", text: q }, answerFor(deal, q)]);
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
        {messages.map((mm, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
              mm.role === "user"
                ? "ml-8 bg-primary text-primary-foreground"
                : "mr-4 bg-secondary text-secondary-foreground"
            }`}
          >
            {mm.text}
            {mm.pages?.length ? (
              <p className="mt-2 text-[11px] opacity-70">Source: OM p.{mm.pages.join(", p.")}</p>
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
          placeholder="What is the DSCR?"
        />
        <Button type="submit" size="icon" aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </aside>
  );
}
