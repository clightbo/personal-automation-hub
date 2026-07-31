import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "./primitives";
import type { Deal } from "@/lib/deal-types";

function asText(item: unknown): string {
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const nested =
      o.text ?? o.content ?? o.summary ?? o.title ?? o.label ?? o.item ?? o.description;
    if (typeof nested === "string") return nested;
  }
  return "";
}

function List({ title, items }: { title: string; items: unknown[] }) {
  const lines = items.map(asText).filter(Boolean);
  return (
    <div>
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed">
        {lines.map((line, idx) => (
          <li key={`${idx}-${line.slice(0, 24)}`} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InvestmentSummary({ deal }: { deal: Deal }) {
  return (
    <section id="summary" className="animate-rise">
      <SectionHeading
        title="Investment memo"
        description="What goes in the IC packet after the first screen."
        action={
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        }
      />
      <div className="card-surface space-y-6 p-6 sm:p-8">
        <div>
          <h3 className="font-display text-2xl font-semibold tracking-tight text-balance">
            {asText(deal.narrative.headline)}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {asText(deal.narrative.executive_summary)}
          </p>
        </div>
        <div className="grid gap-8 border-t border-border pt-6 md:grid-cols-2">
          <List title="Key strengths" items={deal.narrative.key_strengths} />
          <List title="Key concerns" items={deal.narrative.key_concerns} />
          <List title="Critical questions for the broker" items={deal.narrative.critical_questions} />
          <List title="Recommended next steps" items={deal.narrative.recommended_next_steps} />
        </div>
        <div className="border-t border-border pt-4 text-xs text-muted-foreground">
          Extracted from {deal.extraction_meta.source_pages} pages ·{" "}
          {(deal.extraction_meta.confidence * 100).toFixed(0)}% confidence
          {deal.extraction_meta.missing_fields.length
            ? ` · missing: ${deal.extraction_meta.missing_fields.join(", ")}`
            : ""}
        </div>
      </div>
    </section>
  );
}