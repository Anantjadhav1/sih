"use client";

import { ArrowRight, Layers, ShieldCheck } from "lucide-react";
import { ROLES, useRole } from "@/lib/roles";

export default function LoginScreen() {
  const { setRole, signingIn, signInError } = useRole();

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-y-auto bg-background p-6">
      <div className="w-full max-w-2xl">
        <header className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/15 ring-1 ring-inset ring-primary/30">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              National Digital Platform for Land Governance
            </h1>
            <p className="text-xs text-muted-foreground">
              Research &middot; Policy Innovation &middot; Evidence-Based Decisions
              &middot;{" "}
              <span className="font-mono">SIH26019</span>
            </p>
          </div>
        </header>

        <div className="mt-7">
          <h2 className="text-sm font-semibold">Choose a role to continue</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each role sees a different slice of the platform. You can switch at
            any time from the top bar.
          </p>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              disabled={signingIn !== null}
              className="group flex flex-col rounded-lg border border-border bg-surface-2/50 p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:cursor-wait disabled:opacity-70"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{r.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </span>
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {signingIn === r.id ? "Signing in…" : r.username}
              </span>
              <span className="mt-1.5 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                {r.blurb}
              </span>
              <span className="mt-3 flex flex-wrap gap-1">
                {r.canRecord && (
                  <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary">
                    Seal decisions
                  </span>
                )}
                {r.canCreate && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Publish calls
                  </span>
                )}
                {r.canApply && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Apply
                  </span>
                )}
                {!r.canApply && !r.canCreate && (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Send photos
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {signInError && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            {signInError}
          </p>
        )}

        <p className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            One-click demo accounts: the button fills in the demo password for you. The server
            checks it and returns a signed pass, and every change you make is checked against
            that signature - so the server, not your browser, decides what you&rsquo;re allowed
            to do.
          </span>
        </p>
      </div>
    </div>
  );
}
