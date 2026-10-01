"use client";

import type { ReactNode } from "react";
import { ChevronDown, CloudRain, Shuffle, TrendingUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISTRICT_PROFILES } from "@/lib/districts";
import { POLICY_LEVERS, getLever } from "@/lib/levers";
import type { Zone } from "@/lib/zones";
import type { SimulationResult } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PolicySidebarProps {
  districtId: string;
  onDistrictChange: (id: string) => void;
  pct: number;
  onPctChange: (value: number) => void;
  onPctCommit: (value: number) => void;
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  result: SimulationResult | null;
  monsoon: number;
  onMonsoonChange: (v: number) => void;
  growth: number;
  onGrowthChange: (v: number) => void;
  onCommitFactors: () => void;
  onRandomize: () => void;
  scenarioMode: "manual" | "randomized";
  leverId: string;
  onLeverChange: (id: string) => void;
}

/** Named scenarios, as fractions of whatever the active lever allows. */
const PRESETS = [
  { label: "None", value: 0 },
  { label: "Current trend", value: 25 },
  { label: "Accelerated", value: 55 },
  { label: "Maximum", value: 90 },
];

/** A shared chip style for every pick-one button in the sidebar. */
function chip(on: boolean) {
  return cn(
    "rounded-md border px-2 py-1.5 text-left text-[11px] font-medium leading-snug transition-colors",
    on
      ? "border-primary/40 bg-primary/15 text-primary"
      : "border-border bg-surface-2/50 text-muted-foreground hover:text-foreground"
  );
}

/** A numbered step: the sidebar reads top to bottom as an instruction list. */
function Step({
  n,
  title,
  action,
  children,
}: {
  n: number;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
          {n}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export default function PolicySidebar({
  districtId,
  onDistrictChange,
  pct,
  onPctChange,
  onPctCommit,
  zones,
  selectedZoneId,
  onSelectZone,
  result,
  monsoon,
  onMonsoonChange,
  growth,
  onGrowthChange,
  onCommitFactors,
  onRandomize,
  scenarioMode,
  leverId,
  onLeverChange,
}: PolicySidebarProps) {
  const lever = getLever(leverId);
  const activeZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-border bg-surface-1 p-4 lg:w-[19rem] lg:border-r">
      <header>
        <h1 className="text-base font-semibold tracking-tight">Test a land-use policy</h1>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Choose a place, a change and how much of it. The risk results update on the right.
        </p>
      </header>

      {/* ---- 1. Where ---- */}
      <Step n={1} title="Where?">
        <Select value={districtId} onValueChange={onDistrictChange}>
          <SelectTrigger
            id="district-select"
            aria-label="District"
            className="h-9 w-full bg-surface-2/60 text-xs"
          >
            <SelectValue placeholder="Select a district" />
          </SelectTrigger>
          <SelectContent>
            {DISTRICT_PROFILES.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {zones.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onSelectZone(null)}
              className={chip(activeZone === null)}
            >
              Whole district
            </button>
            {zones.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => onSelectZone(z.id)}
                title={z.character}
                className={chip(z.id === selectedZoneId)}
              >
                {z.name}
              </button>
            ))}
          </div>
        )}

        {activeZone && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {activeZone.character}.
            {result?.zone === activeZone.id && (
              <>
                {" "}
                Already has{" "}
                <span className="font-medium text-foreground">
                  {result.baseline_flood_risk_pct}%
                </span>{" "}
                flood risk before any change.
              </>
            )}
          </p>
        )}
      </Step>

      {/* ---- 2. What ---- */}
      <Step n={2} title="What change?">
        <div className="grid grid-cols-2 gap-1.5">
          {POLICY_LEVERS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onLeverChange(l.id)}
              aria-pressed={l.id === leverId}
              className={chip(l.id === leverId)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{lever.explanation}</p>
      </Step>

      {/* ---- 3. How much ---- */}
      <Step
        n={3}
        title="How much?"
        action={
          <button
            type="button"
            onClick={onRandomize}
            title="Pick a random amount, monsoon and population growth"
            className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
              scenarioMode === "randomized"
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Shuffle className="h-3 w-3" />
            Randomize
          </button>
        }
      >
        <div className="flex items-baseline gap-1.5">
          <span className="animate-value-in font-mono text-3xl font-semibold tracking-tight text-primary">
            {pct}%
          </span>
          <span className="text-[11px] text-muted-foreground">
            of the {activeZone ? "zone's" : "district's"} land
          </span>
        </div>

        <Slider
          id="conversion-slider"
          min={0}
          max={lever.maxPct}
          step={1}
          value={[pct]}
          onValueChange={(v) => onPctChange(v[0])}
          onValueCommit={(v) => onPctCommit(v[0])}
          aria-label={`${lever.fullLabel}, percent of land`}
        />
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>{lever.maxPct}%</span>
        </div>
        {lever.maxPct < 100 && (
          <p className="text-[10px] text-muted-foreground">
            Capped at {lever.maxPct}% - beyond that there is no wetland left.
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((raw) => {
            const value = Math.round((raw.value / 100) * lever.maxPct);
            return (
              <button
                key={raw.label}
                type="button"
                onClick={() => {
                  onPctChange(value);
                  onPctCommit(value);
                }}
                className={chip(pct === value)}
              >
                {raw.label}
                <span className="ml-1 font-mono opacity-60">{value}%</span>
              </button>
            );
          })}
        </div>
      </Step>

      {/*
        Advanced conditions stay folded away - the summary line still shows
        their current values, so a randomized scenario is never hidden.
      */}
      <details className="group rounded-lg border border-border bg-surface-2/30 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-medium">
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          Weather &amp; population
          <span className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">
            {monsoon.toFixed(2)}&times; &middot; {growth.toFixed(1)}%/yr
          </span>
        </summary>

        <div className="mt-3 space-y-4 pb-1">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="monsoon-slider" className="flex items-center gap-1.5 text-xs">
                <CloudRain className="h-3 w-3 text-muted-foreground" />
                Monsoon strength
              </Label>
              <span className="font-mono text-xs">{monsoon.toFixed(2)}&times;</span>
            </div>
            <Slider
              id="monsoon-slider"
              min={0.5}
              max={2}
              step={0.05}
              value={[monsoon]}
              onValueChange={(v) => onMonsoonChange(v[0])}
              onValueCommit={onCommitFactors}
              className="mt-2"
              aria-label="Monsoon strength compared with a normal year"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">1.00&times; is a normal year.</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="growth-slider" className="flex items-center gap-1.5 text-xs">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                Population growth
              </Label>
              <span className="font-mono text-xs">{growth.toFixed(1)}%/yr</span>
            </div>
            <Slider
              id="growth-slider"
              min={0}
              max={5}
              step={0.1}
              value={[growth]}
              onValueChange={(v) => onGrowthChange(v[0])}
              onValueCommit={onCommitFactors}
              className="mt-2"
              aria-label="Population growth per year"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              1.2%/yr is today&rsquo;s trend.
            </p>
          </div>
        </div>
      </details>
    </aside>
  );
}
