import { useRef, useState } from "react";
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

const SCREEN_ENDPOINT = "https://clarkcbre.app.n8n.cloud/webhook/screen-om-free";
const API_KEY = (import.meta.env as Record<string, string | undefined>).VITE_SCREEN_API_KEY ?? "";

export interface ScreeningSettings {
  dealTerms: Record<string, unknown>;
  market: Record<string, unknown>;
  criteria: Record<string, unknown>;
  assumptions: Record<string, unknown>;
  notes?: string;
}

async function handleRunScreening(file: File, settings: ScreeningSettings) {
  const formData = new FormData();
  formData.append("data", file);
  formData.append("deal_terms", JSON.stringify(settings.dealTerms || {}));
  formData.append("market", JSON.stringify(settings.market || {}));
  formData.append("criteria", JSON.stringify(settings.criteria || {}));
  formData.append("assumptions", JSON.stringify(settings.assumptions || {}));
  if (settings.notes) formData.append("notes", settings.notes);

  const response = await fetch(SCREEN_ENDPOINT, {
    method: "POST",
    headers: API_KEY ? { "x-api-key": API_KEY } : undefined,
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Screening failed: " + response.status);
  }

  return await response.json();
}

function collectSettings(useWebSearch: boolean, disabledSources: string[]): ScreeningSettings {
  const val = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value?.trim() ??
    "";
  const numOr = (id: string, fallback: number) => {
    const n = Number(val(id));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const minDscr = numOr("dscr", 1.25);
  const holdYears = numOr("hold", 5);
  const targetIrr = numOr("irr", 15);
  const targetMarket = val("market");
  const notes = val("notes");

  return {
    dealTerms: {
      min_dscr: minDscr,
      ltv: 60,
      interest_rate: 6.5,
      amortization_years: 30,
      min_debt_yield: 9,
    },
    assumptions: {
      hold_years: holdYears,
      target_irr: targetIrr,
      rent_growth: 3,
      expense_growth: 3,
      sale_cost_pct: 2,
    },
    criteria: {},
    market: {
      target_market: targetMarket || undefined,
      use_web_search: useWebSearch,
      disabled_sources: disabledSources,
    },
    notes: notes || undefined,
  };
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

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== "application/pdf") {
      toast.error("Please upload a PDF offering memorandum.");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error("That PDF is over 50 MB — please upload a smaller file.");
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
    const settings = collectSettings(useWebSearch, disabled);
    const request = handleRunScreening(file, settings).then(
      (result) => ({ ok: true as const, result }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    for (let i = 0; i < STAGES.length; i++) {
      setStage(i);
      await new Promise((r) => setTimeout(r, 750));
    }
    const res = await request;
    if (res.ok) {
      try {
        const deal = saveScreeningResult(normalizeDeal(res.result));
        navigate({ to: "/deal/$dealId", params: { dealId: deal.id } });
        return;
      } catch {
        toast.error("The screening response could not be read.");
        setStage(null);
        return;
      }
    }
    toast("Live screening unavailable — showing a sample result.", {
      description: "The screening endpoint did not return a result. The deal below is sample data.",
    });
    navigate({ to: "/deal/$dealId", params: { dealId: mockDeals[2].id } });
  };

  if (stage !== null) {
    return (
      <AppShell>
        <div className="py-16">
          <ProcessingStepper active={stage} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-center text-3xl font-semibold tracking-tight">
          Screen a multifamily deal
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Upload an offering memorandum and get metrics, risk flags, a bid sensitivity ladder and a
          written investment memo.
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
            "mt-8 cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors",
            dragging ? "border-primary bg-secondary" : "border-border bg-card",
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
              <p className="text-xs text-muted-foreground">PDF only, up to 50 MB</p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="notes" className="text-xs tracking-wide text-muted-foreground uppercase">
            Notes (optional)
          </Label>
          <Textarea
            id="notes"
            placeholder="Anything the model should know about this deal…"
            rows={3}
          />
        </div>

        <div className="card-surface mt-4 overflow-hidden">
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          >
            Analysis settings
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", settingsOpen && "rotate-180")}
            />
          </button>
          {settingsOpen ? (
            <div className="space-y-4 border-t border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Setting
                  id="market"
                  label="Target market"
                  defaultValue=""
                  placeholder="e.g. South Tampa"
                />
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
                          "rounded-full border px-3 py-1 text-xs transition-colors",
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
            Run Screening
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate({ to: "/deal/$dealId", params: { dealId: mockDeals[0].id } })}
          >
            Load Sample Deal
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
