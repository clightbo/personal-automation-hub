import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, FileText, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ProcessingStepper, STAGES } from "@/components/deal/ProcessingStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { hydrateDealMetrics } from "@/lib/bid-math";
import { mockDeals } from "@/lib/mock-deals";
import { normalizeDeal, saveScreeningResult } from "@/lib/screening-result";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "DealScreen AI — Multifamily OM Screening in Minutes" },
      {
        name: "description",
        content:
          "Upload a multifamily offering memorandum and get cap rate, DSCR, bid sensitivity, risk flags and an investment memo in minutes.",
      },
      { property: "og:title", content: "DealScreen AI — Multifamily OM Screening" },
      {
        property: "og:description",
        content:
          "Automated investment screening for multifamily offering memoranda: metrics, risk flags, bid sensitivity and a written memo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const GUARDRAILS = [
  "Rent comparables",
  "Supply pipeline",
  "Census income data",
  "Public tax records",
  "Web search",
];

/** Free OpenRouter extract + memo often takes 60–180s. Do not fall back to demo. */
const SCREENING_TIMEOUT_MS = 4 * 60 * 1000;

async function handleRunScreening(file: File, settings?: any) {
  const formData = new FormData();
  formData.append("data", file);
  formData.append("deal_terms", JSON.stringify(settings?.dealTerms || {}));
  formData.append("market", JSON.stringify(settings?.market || {}));
  formData.append("criteria", JSON.stringify(settings?.criteria || {}));
  formData.append("assumptions", JSON.stringify(settings?.assumptions || {}));

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SCREENING_TIMEOUT_MS);

  try {
    const response = await fetch("https://clarkcbre.app.n8n.cloud/webhook/screen-om-free", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Screening failed: HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        "Screening timed out after 4 minutes. Check n8n Executions — the run may still finish there.",
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

function Index() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [stage, setStage] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [statusHint, setStatusHint] = useState("");

  useEffect(() => {
    if (stage === null) return;
    setElapsedSec(0);
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [stage === null ? null : "running"]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF offering memorandum.");
      return;
    }
    setFile(f);
  };

  const run = async () => {
    if (!file) {
      toast.error("Upload an offering memorandum PDF first.");
      return;
    }
    setStage(0);
    setStatusHint("Reading the OM PDF…");
    const request = handleRunScreening(file, {
      dealTerms: {
        ltv: 60,
        interest_rate: 6.5,
        amortization_years: 30,
        min_dscr: 1.25,
        min_debt_yield: 9,
      },
      market: {},
      criteria: {},
      assumptions: {
        hold_years: 5,
        rent_growth: 3,
        expense_growth: 3,
        sale_cost_pct: 2,
        target_irr: 15,
      },
    }).then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    // Animate stages while waiting — do NOT treat animation end as failure.
    for (let i = 0; i < STAGES.length; i++) {
      setStage(i);
      setStatusHint(
        i < 2
          ? "Extract model is reading the OM (often 1–3 min on free models)…"
          : "Still running in n8n — stay on this page until it finishes…",
      );
      await new Promise((r) => setTimeout(r, 900));
    }
    setStage(STAGES.length - 1);
    setStatusHint("Waiting on n8n webhook response…");

    const res = await request;
    if (res.ok) {
      try {
        const deal = saveScreeningResult(hydrateDealMetrics(normalizeDeal(res.result)));
        navigate({ to: "/deal/$dealId", params: { dealId: deal.id } });
        return;
      } catch {
        toast.error("The screening response could not be read.");
        setStage(null);
        return;
      }
    }

    // Never open the demo deal on a failed/slow run — that looked like “bad numbers.”
    const message =
      res.error instanceof Error
        ? res.error.message
        : "The screening endpoint did not return a result.";
    toast.error("Live screening did not finish", {
      description: `${message} Check n8n Executions — a late success there is the real result.`,
      duration: 12000,
    });
    setStage(null);
  };

  if (stage !== null) {
    return (
      <AppShell>
        <div className="py-16">
          <ProcessingStepper active={stage} />
          <p className="mx-auto mt-6 max-w-md text-center text-sm text-muted-foreground">
            {statusHint}
          </p>
          <p className="mx-auto mt-2 max-w-md text-center text-xs text-muted-foreground">
            Elapsed {elapsedSec}s · free extract models often take 60–180s. Do not leave this
            page — a demo will no longer load on timeout.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl animate-rise">
        <div className="upload-stage relative px-6 py-10 sm:px-10 sm:py-12">
          <div className="relative">
            <p className="text-center text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
              DealScreen AI · OM screening desk
            </p>
            <h1 className="font-display mt-3 text-center text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Turn an offering memorandum into an IC brief
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
              Drop a multifamily OM PDF. We extract underwriting metrics, score
              kill criteria, build a bid ladder, and draft the memo a portfolio
              manager needs before the first broker call.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "mt-8 cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-all duration-300",
                dragging
                  ? "border-primary bg-secondary scale-[1.01]"
                  : "border-border/80 bg-card/80 hover:border-primary/40",
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-8 w-8 text-primary" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB · click to replace
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Drop the offering memorandum here</p>
                  <p className="text-xs text-muted-foreground">PDF only · up to 50 MB</p>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 text-center text-[11px] tracking-wide text-muted-foreground uppercase sm:grid-cols-3">
              <p>Cap · DSCR · debt yield</p>
              <p>Risk flags & kill criteria</p>
              <p>Bid ladder + IC memo</p>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-1.5">
          <Label htmlFor="notes" className="text-xs tracking-wide text-muted-foreground uppercase">
            Notes for underwriting (optional)
          </Label>
          <Textarea
            id="notes"
            placeholder="Sponsor context, target hold, leverage preference, anything the screen should weight…"
            rows={3}
          />
        </div>

        <div className="card-surface mt-4 overflow-hidden">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          >
            Underwriting settings
            <ChevronDown className={cn("h-4 w-4 transition-transform", settingsOpen && "rotate-180")} />
          </button>
          {settingsOpen ? (
            <div className="space-y-4 border-t border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Setting id="market" label="Target market" defaultValue="" placeholder="e.g. South Tampa" />
                <Setting id="dscr" label="Minimum DSCR" defaultValue="1.25" />
                <Setting id="hold" label="Hold period (years)" defaultValue="5" />
                <Setting id="irr" label="Target IRR (%)" defaultValue="15" />
              </div>
              <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
                <Label htmlFor="web" className="text-sm font-normal">
                  Use web search for market data
                </Label>
                <Switch id="web" checked={useWebSearch} onCheckedChange={setUseWebSearch} />
              </div>
              <div>
                <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
                  Guardrails — disable data sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {GUARDRAILS.map((g) => {
                    const off = disabled.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setDisabled((d) => (off ? d.filter((i) => i !== g) : [...d, g]))
                        }
                        className={cn(
                          "rounded-md border px-3 py-1 text-xs transition-colors",
                          off
                            ? "border-critical/40 bg-critical-soft text-critical line-through"
                            : "border-border bg-card hover:bg-secondary",
                        )}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button className="flex-1" size="lg" onClick={run}>
            Run screening
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate({ to: "/deal/$dealId", params: { dealId: mockDeals[0].id } })}
          >
            Open sample IC brief
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Setting({
  id,
  label,
  defaultValue,
  placeholder,
}: {
  id: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </Label>
      <Input id={id} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
