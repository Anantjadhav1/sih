"use client";

import { CloudRain, MapPin, Ruler, Shuffle, Sprout, Target, TrendingUp, Users, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISTRICT_PROFILES, getProfile } from "@/lib/districts";
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

const nf = new Intl.NumberFormat("en-IN");

/** Named scenarios so a demo can jump to a meaningful point in one click. */
const PRESETS = [
  { label: "Baseline", value: 0 },
  { label: "Current trend", value: 25 },
  { label: "Accelerated", value: 55 },
  { label: "Max build-out", value: 90 },
];

function ContextRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="font-mono text-xs">{value}</span>
    </div>
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
  const profile = getProfile(districtId);
  const lever = getLever(leverId);
  const activeZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-border bg-surface-1 p-4 lg:w-[19rem] lg:border-r">
      {/* ---- Scope ---- */}
      <section className="space-y-2">
        <Label
          htmlFor="district-select"
          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Study area
        </Label>
        <Select value={districtId} onValueChange={onDistrictChange}>
          <SelectTrigger id="district-select" className="h-10 w-full bg-surface-2/60">
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

        <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-1.5">
          <ContextRow icon={Ruler} label="Area" value={`${nf.format(profile.area)} km²`} />
          <ContextRow
            icon={Users}
            label="Population"
            value={`${(profile.population / 1e6).toFixed(2)} M`}
          />
          <ContextRow
            icon={Sprout}
            label="Under cultivation"
            value={`${Math.round(profile.agriShare * 100)}%`}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{profile.blurb}</p>
      </section>

      {/* ---- Zone scope ---- */}
      <section className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Target className="h-3 w-3" />
            Zone scope
          </p>
          {activeZone && (
            <button
              type="button"
              onClick={() => onSelectZone(null)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
              Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {zones.map((z) => {
            const on = z.id === selectedZoneId;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => onSelectZone(on ? null : z.id)}
                title={z.character}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
                  on
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-surface-2/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {z.name}
              </button>
            );
          })}
        </div>

        {activeZone ? (
          <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
            <p className="text-[11px] leading-snug">{activeZone.character}</p>
            {result?.zone === activeZone.id && (
              <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
                Standing flood risk before any conversion:{" "}
                <span className="font-mono font-medium text-foreground">
                  {result.baseline_flood_risk_pct}%
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Simulating the district average. Pick a zone - here or on the map -
            to scope the projection to one ward.
          </p>
        )}
      </section>

      {/* ---- Policy lever ---- */}
      <section className="space-y-3 border-t border-border pt-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Policy lever
          </p>

          {/* Which conversion is being modelled - each has its own maths */}
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {POLICY_LEVERS.map((l) => {
              const on = l.id === leverId;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onLeverChange(l.id)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-left text-[11px] font-medium leading-snug transition-colors",
                    on
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-surface-2/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          <p className="mt-2 rounded-md border border-border bg-surface-2/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {lever.explanation}
          </p>

          <Label htmlFor="conversion-slider" className="mt-3 block text-sm font-medium">
            {lever.fullLabel}
          </Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Applied to {activeZone ? activeZone.name : `${profile.name} district`}
          </p>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="animate-value-in font-mono text-3xl font-semibold tracking-tight text-primary">
            {pct}
          </span>
          <span className="text-sm text-muted-foreground">
            % of {activeZone ? "zone" : "district"} agri land
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
          aria-label="Percentage of agricultural land converted to commercial use"
        />
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>{Math.round(lever.maxPct / 2)}%</span>
          <span>{lever.maxPct}%</span>
        </div>
        {lever.maxPct < 100 && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            Capped at {lever.maxPct}% - beyond that there is no wetland left to
            model.
          </p>
        )}

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {/* Presets are fractions of whatever the active lever allows */}
          {PRESETS.map((raw) => {
            const p = {
              label: raw.label,
              value: Math.round((raw.value / 100) * lever.maxPct),
            };
            return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                onPctChange(p.value);
                onPctCommit(p.value);
              }}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                pct === p.value
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-surface-2/50 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
              )}
            >
              {p.label}
              <span className="ml-1 font-mono opacity-60">{p.value}%</span>
            </button>
            );
          })}
        </div>
      </section>

      {/* ---- Secondary scenario factors ---- */}
      <section className="space-y-3 border-t border-border pt-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Scenario conditions
        </p>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Label
              htmlFor="monsoon-slider"
              className="flex items-center gap-1.5 text-xs font-medium"
            >
              <CloudRain className="h-3 w-3 text-muted-foreground" />
              Monsoon intensity
            </Label>
            <span className="font-mono text-xs font-semibold">
              {monsoon.toFixed(2)}&times;
            </span>
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
            aria-label="Monsoon intensity relative to the long-period average"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            1.00&times; is the long-period average. Drives the flood term.
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <Label
              htmlFor="growth-slider"
              className="flex items-center gap-1.5 text-xs font-medium"
            >
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              Population growth
            </Label>
            <span className="font-mono text-xs font-semibold">
              {growth.toFixed(1)}%/yr
            </span>
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
            aria-label="Annual population growth rate"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Compounded over a 10-year horizon. Drives displacement.
          </p>
        </div>

        <button
          type="button"
          onClick={onRandomize}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
            scenarioMode === "randomized"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border bg-surface-2/50 text-foreground hover:border-primary/40 hover:bg-primary/10"
          )}
        >
          <Shuffle className="h-3.5 w-3.5" />
          Randomize scenario
        </button>
      </section>

      <p className="mt-auto border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground">
        Boundaries: Census of India 2011. Projections are a mocked linear model
        for the MVP demo.
        <br />
        Ministry of Rural Development
      </p>
    </aside>
  );
}
