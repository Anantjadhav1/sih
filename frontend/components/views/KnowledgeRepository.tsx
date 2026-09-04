"use client";

import { useMemo, useState } from "react";
import { Database, FileText, Landmark, Search, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ENTRY_TYPES, REPOSITORY } from "@/lib/repository";
import type { EntryType, RepositoryEntry } from "@/lib/repository";
import { searchRepository } from "@/lib/search";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<EntryType, LucideIcon> = {
  "Research Paper": FileText,
  Dataset: Database,
  "Policy Document": Landmark,
  "Case Study": FileText,
};

/**
 * Type badges are a nominal scale with no ordering, and they sit next to the
 * risk ramp elsewhere in the app - so they stay in neutral ink with a written
 * label rather than borrowing hues that mean "risk" one tab over.
 */
function TypeBadge({ type }: { type: EntryType }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Icon className="h-2.5 w-2.5" />
      {type}
    </span>
  );
}

function EntryCard({
  entry,
  relevance,
  onView,
}: {
  entry: RepositoryEntry;
  /** 0-1, relative to the strongest hit; null when no query is active. */
  relevance: number | null;
  onView: (e: RepositoryEntry) => void;
}) {
  return (
    <article className="flex flex-col rounded-lg border border-border bg-surface-2/50 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug">{entry.title}</h3>
        <TypeBadge type={entry.type} />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          {entry.org} &middot; <span className="font-mono">{entry.date}</span>
        </span>
        {relevance !== null && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
            title="Relevance relative to the best match for this query"
          >
            <Sparkles className="h-2.5 w-2.5" />
            {Math.round(relevance * 100)}% match
          </span>
        )}
      </p>
      <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
        {entry.description}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="truncate text-[10px] text-muted-foreground">{entry.authors}</p>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 px-3 text-[11px]"
          onClick={() => onView(entry)}
        >
          View
        </Button>
      </div>
    </article>
  );
}

export default function KnowledgeRepository() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<EntryType | "All">("All");
  const [preview, setPreview] = useState<RepositoryEntry | null>(null);

  const hasQuery = query.trim().length > 0;

  // Ranked by the local relevance scorer; the type chips filter the ranking
  // rather than participating in it, so switching type never reorders results.
  const results = useMemo(
    () =>
      searchRepository(query).filter(
        ({ entry }) => type === "All" || entry.type === type
      ),
    [query, type]
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Knowledge Repository</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Research papers, open datasets, policy instruments and field case
            studies on Indian land governance.
          </p>
        </header>

        {/* Filters sit in one row above the results, per the standard pattern */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search — typo-tolerant, ranked by relevance…"
              aria-label="Search the repository"
              className="h-9 bg-surface-2/60 pl-9 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["All", ...ENTRY_TYPES] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  type === t
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-surface-2/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span>
            {results.length} of {REPOSITORY.length} entries
          </span>
          {hasQuery && (
            <span className="font-sans text-[10px]">ranked by relevance</span>
          )}
        </p>

        {results.length === 0 ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Nothing matches &ldquo;{query}&rdquo;. Try a broader term.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {results.map(({ entry, relevance }) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                relevance={hasQuery ? relevance : null}
                onView={setPreview}
              />
            ))}
          </div>
        )}
      </div>

      {/* Placeholder detail view - the real one renders the stored document */}
      {preview && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={preview.title}
          onClick={() => setPreview(null)}
        >
          <div
            className="max-w-lg rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <TypeBadge type={preview.type} />
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h2 className="mt-2 text-base font-semibold leading-snug">
              {preview.title}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {preview.authors} &middot; {preview.org} &middot;{" "}
              <span className="font-mono">{preview.date}</span>
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {preview.description}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {preview.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </div>
            <p className="mt-4 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Full-text retrieval is not wired up in this MVP. In the production
              build this pane streams the stored PDF and the Policy Co-Pilot
              answers against its embedded chunks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
