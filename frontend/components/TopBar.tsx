"use client";

import { useState } from "react";
import { Activity, ChevronRight, Layers, UserCog } from "lucide-react";
import { ROLES, useRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export default function TopBar({
  districtLabel,
  online,
}: {
  districtLabel: string;
  online: boolean;
}) {
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface-1 px-4">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 ring-1 ring-inset ring-primary/30">
          <Layers className="h-4 w-4 text-primary" />
        </div>
        <div className="leading-tight">
          <h1 className="text-[13px] font-semibold tracking-tight">
            National Digital Platform for Land Governance
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Research &middot; Policy Innovation &middot; Evidence-Based Decisions
          </p>
        </div>
      </div>

      {/* Breadcrumb keeps the active scope visible while the map is panned */}
      <nav className="ml-2 hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
        <ChevronRight className="h-3.5 w-3.5" />
        <span>India</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span>Maharashtra</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{districtLabel}</span>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden font-mono text-[11px] uppercase tracking-wider text-muted-foreground md:inline">
          SIH26019
        </span>

        {/* Current role, with an inline switcher so demos can hop views fast */}
        {role && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/70 px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-primary/40"
            >
              <UserCog className="h-3 w-3 text-muted-foreground" />
              {role.label}
              <ChevronRight
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  open && "rotate-90"
                )}
              />
            </button>

            {open && (
              <>
                {/* Click-away catcher, behind the menu */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setOpen(false)}
                  aria-hidden
                />
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-1.5 w-60 rounded-lg border border-border bg-popover p-1 shadow-2xl"
                >
                  <p className="px-2 pt-1.5 text-[10px] text-muted-foreground">
                    Signed in as <span className="font-mono">{role.username}</span>
                  </p>
                  <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Switch role
                  </p>
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRole(r.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors",
                        r.id === role.id
                          ? "bg-primary/15 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <span className="text-[11px] font-medium">{r.label}</span>
                      <span className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                        {r.blurb}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
            online
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          )}
        >
          <Activity className="h-3 w-3" />
          {online ? "Simulation engine live" : "Engine unreachable"}
        </span>
      </div>
    </header>
  );
}
