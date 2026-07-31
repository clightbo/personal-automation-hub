import { Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-card/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="group flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-transform duration-300 group-hover:scale-[1.03]">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              DealScreen AI
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground"
            >
              Screen a deal
            </Link>
            <Link
              to="/pipeline"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&.active]:bg-secondary [&.active]:text-foreground"
            >
              Pipeline
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
