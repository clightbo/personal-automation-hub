import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "overview", label: "Brief" },
  { id: "key-metrics", label: "Metrics" },
  { id: "risk", label: "Risk" },
  { id: "bid-sensitivity", label: "Bid ladder" },
  { id: "deal-terms", label: "Terms" },
  { id: "market", label: "Market" },
  { id: "summary", label: "Memo" },
] as const;

export function DealSectionNav() {
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (n): n is HTMLElement => Boolean(n),
    );
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.4, 0.7] },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Deal sections"
      className="sticky top-14 z-20 -mx-4 mb-8 border-y border-border/80 bg-background/90 px-4 backdrop-blur print:hidden sm:-mx-6 sm:px-6"
    >
      <div className="flex gap-1 overflow-x-auto py-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              setActive(s.id);
            }}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium tracking-wide transition-colors",
              active === s.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
