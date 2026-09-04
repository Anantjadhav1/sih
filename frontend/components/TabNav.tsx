"use client";

import {
  BookOpen,
  LayoutDashboard,
  Layers3,
  Lightbulb,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId =
  | "dashboard"
  | "simulator"
  | "repository"
  | "gis"
  | "innovation";

export const TABS: { id: TabId; label: string; icon: LucideIcon; hint: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "Platform overview" },
  { id: "simulator", label: "Simulator", icon: SlidersHorizontal, hint: "Test a conversion policy" },
  { id: "repository", label: "Knowledge Repository", icon: BookOpen, hint: "Research, datasets, policy" },
  { id: "gis", label: "GIS Explorer", icon: Layers3, hint: "Browse thematic layers" },
  { id: "innovation", label: "Innovation Hub", icon: Lightbulb, hint: "Hackathons and grants" },
];

export default function TabNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  return (
    <nav
      aria-label="Platform sections"
      className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-surface-1 px-4"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={selected ? "page" : undefined}
            title={t.hint}
            className={cn(
              // -1px bottom margin lets the active underline sit on the border
              "-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
              selected
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
