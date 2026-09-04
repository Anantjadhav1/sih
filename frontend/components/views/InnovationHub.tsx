"use client";

import { useState } from "react";
import {
  Award,
  CalendarDays,
  Check,
  Eye,
  FlaskConical,
  Plus,
  Trophy,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPPORTUNITIES } from "@/lib/innovation";
import type { OpportunityType } from "@/lib/innovation";
import { useRole } from "@/lib/roles";

const TYPE_ICON: Record<OpportunityType, LucideIcon> = {
  Hackathon: Trophy,
  Grant: Award,
  "Pilot Project": FlaskConical,
};

/** Days until the deadline, from today. */
function daysLeft(iso: string): number {
  const ms = new Date(`${iso}T00:00:00`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export default function InnovationHub() {
  const { role } = useRole();
  const canApply = role?.canApply ?? false;
  const canCreate = role?.canCreate ?? false;

  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Innovation Hub</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Open calls where research from this platform can turn into funded
              work - hackathons, grants and state pilot deployments.
            </p>
          </div>
          {/* Publishing is the one action reserved to officials */}
          {canCreate && (
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1.5 px-3 text-[11px]"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create new hackathon / grant
            </Button>
          )}
        </header>

        {/* Say what this role may do rather than silently hiding controls */}
        {!canApply && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            Viewing as {role?.label ?? "Public User"} - listings are read-only.
            Switch role in the top bar to apply.
          </p>
        )}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {OPPORTUNITIES.map((o) => {
            const Icon = TYPE_ICON[o.type];
            const left = daysLeft(o.closes);
            return (
              <article
                key={o.id}
                className="flex flex-col rounded-lg border border-border bg-surface-2/50 p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold leading-snug">{o.title}</h2>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Icon className="h-2.5 w-2.5" />
                    {o.type}
                  </span>
                </div>

                <p className="mt-1.5 text-[11px] text-muted-foreground">{o.org}</p>

                <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                  {o.description}
                </p>

                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <dt className="sr-only">Deadline</dt>
                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                    <dd className="font-mono">{o.deadline}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="text-muted-foreground">Award</dt>
                    <dd className="font-medium">{o.prize}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                  {/* Urgency is stated in words, not conveyed by colour alone */}
                  <p className="text-[11px] text-muted-foreground">
                    {left > 0 ? (
                      <>
                        <span className="font-mono font-medium text-foreground">
                          {left}
                        </span>{" "}
                        days remaining
                      </>
                    ) : (
                      "Applications closed"
                    )}
                  </p>
                  {canApply ? (
                    applied.has(o.id) ? (
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
                        <Check className="h-3.5 w-3.5" />
                        Application started
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-3 text-[11px]"
                        disabled={left <= 0}
                        onClick={() => setApplied((prev) => new Set(prev).add(o.id))}
                      >
                        Apply
                      </Button>
                    )
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Read-only</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-5 rounded-lg border border-border bg-surface-2/40 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Listings are static in this MVP. The production build syncs them from
          the DoLR and NITI Aayog opportunity feeds, and the buttons open the
          respective application portals.
        </p>
      </div>

      {/* Publish form - laid out but intentionally not wired to a backend */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Create a new opportunity"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Publish a new call</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Available to {role?.label ?? "officials"} only
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-title" className="text-[11px]">Title</Label>
                <Input
                  id="new-title"
                  placeholder="e.g. Cadastral AI Challenge 2027"
                  className="h-9 bg-surface-2/60 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-type" className="text-[11px]">Type</Label>
                  <Input
                    id="new-type"
                    placeholder="Hackathon"
                    className="h-9 bg-surface-2/60 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-deadline" className="text-[11px]">Deadline</Label>
                  <Input
                    id="new-deadline"
                    placeholder="31 Mar 2027"
                    className="h-9 bg-surface-2/60 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-desc" className="text-[11px]">Description</Label>
                <Input
                  id="new-desc"
                  placeholder="One line on what applicants should build"
                  className="h-9 bg-surface-2/60 text-xs"
                />
              </div>
            </div>

            <p className="mt-4 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Publishing is not wired up in this MVP - there is no opportunities
              table behind this form yet. The production build writes the record
              and notifies subscribed researchers.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-3 text-[11px]"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button size="sm" className="h-8 px-3 text-[11px]" disabled>
                Publish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
