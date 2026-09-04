"use client";

import {
  CloudRain,
  Droplets,
  Leaf,
  Shuffle,
  SlidersHorizontal,
  Sprout,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import RiskCurve from "@/components/RiskCurve";
import { Skeleton } from "@/components/ui/skeleton";
import { RISK_LEVELS, getProfile, riskColor } from "@/lib/districts";
import type { SimulationResult } from "@/lib/api";

const nf = new Intl.NumberFormat("en-IN");

/**
 * A single headline figure - a stat tile, not a chart. The unit sits beside the
 * value and the supporting figure below it, so the number reads at a glance.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="animate-value-in text-xl font-semibold tracking-tight">{value}</span>
        <span className="text-[11px] text-muted-foreground">{unit}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export default function InsightsPanel({
  districtId,
  pct,
  result,
  loading,
  error,
  scenarioMode = "manual",
}: {
  districtId: string;
  pct: number;
  result: SimulationResult | null;
  loading: boolean;
  error: string | null;
  /** Which input mode produced these numbers. */
  scenarioMode?: "manual" | "randomized";
}) {
  const profile = getProfile(districtId);
  const level = result?.risk_level ?? "Low";
  const color = riskColor(level);

  if (error) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium">Simulation engine unreachable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !result) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[74px] w-full" />
          ))}
        </div>
        <Skeleton className="h-[168px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ---- Scenario provenance: what produced these numbers ---- */}
      <section className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium">
            {scenarioMode === "randomized" ? (
              <Shuffle className="h-3 w-3 text-primary" />
            ) : (
              <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
            )}
            Scenario:{" "}
            <span
              className={
                scenarioMode === "randomized" ? "text-primary" : "text-foreground"
              }
            >
              {scenarioMode === "randomized" ? "Randomized" : "Manual"}
            </span>
          </span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {result.policy_lever_label}
        </p>
        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <CloudRain className="h-2.5 w-2.5" />
            <dt>Monsoon</dt>
            <dd className="font-mono font-medium text-foreground">
              {result.monsoon_intensity.toFixed(2)}&times;
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5" />
            <dt>Growth</dt>
            <dd className="font-mono font-medium text-foreground">
              {result.population_growth_rate.toFixed(1)}%/yr
            </dd>
          </div>
        </dl>
      </section>

      {/* ---- Hero: the one number the whole dashboard is about ---- */}
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Composite risk score
            </p>
            <p className="text-[11px] text-muted-foreground">
              {result.zone_name ?? `${profile.name} district`}
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span
                key={result.risk_score}
                className="animate-value-in text-4xl font-semibold tracking-tight"
              >
                {result.risk_score}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </p>
          </div>
          {/* Status colour always ships with its written level */}
          <span
            className="mt-5 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{
              color,
              borderColor: `${color}55`,
              backgroundColor: `${color}1a`,
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {level}
          </span>
        </div>

        {/* Banded meter: the two ticks are the Low/Moderate/High cut-offs */}
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${result.risk_score}%`, backgroundColor: color }}
          />
          <span className="absolute inset-y-0 left-[20%] w-px bg-background/70" />
          <span className="absolute inset-y-0 left-[50%] w-px bg-background/70" />
        </div>
        <div className="mt-1.5 flex justify-between">
          {RISK_LEVELS.map((l) => (
            <span
              key={l}
              className="flex items-center gap-1 text-[10px]"
              style={{ color: l === level ? riskColor(l) : undefined }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: riskColor(l), opacity: l === level ? 1 : 0.4 }}
              />
              <span className={l === level ? "font-semibold" : "text-muted-foreground"}>{l}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ---- Component indicators ---- */}
      <section className="grid grid-cols-2 gap-2">
        <StatTile
          icon={Droplets}
          label="Flood risk"
          value={`+${result.predicted_flood_risk_increase_pct}`}
          unit="%"
          sub={
            result.zone
              ? `on top of ${result.baseline_flood_risk_pct}% standing`
              : "vs. baseline runoff"
          }
        />
        <StatTile
          icon={Users}
          label="Displacement"
          value={nf.format(result.predicted_displacement_persons)}
          unit="persons"
          sub={
            // The per-100k rate needs the population of whatever is in scope,
            // and the zone denominator lives server-side - so show it only for
            // district runs rather than divide by the wrong population.
            result.zone
              ? "within the zone"
              : `${((result.predicted_displacement_persons / profile.population) * 1e5).toFixed(0)} per 100k`
          }
        />
        <StatTile
          icon={Sprout}
          label={result.land_label}
          value={nf.format(result.predicted_farmland_loss_hectares)}
          unit="ha"
          sub={`${result.farmland_loss_share_pct}% of convertible area`}
        />
        <StatTile
          icon={TriangleAlert}
          label="Converted"
          value={`${result.agri_to_commercial_pct}`}
          unit="%"
          sub={`of ${result.zone_name ?? profile.name}'s ${result.land_label
            .toLowerCase()
            .replace(" loss", "")
            .replace(" lost", "")}`}
        />

        {/*
          Only the forest and wetland levers report habitat impact. It runs on
          its own curve, so it can be severe while flood risk is still modest -
          that divergence is the trade-off worth showing.
        */}
        {result.biodiversity_impact_score !== null && (
          <div className="col-span-2 rounded-lg border border-border bg-surface-2/60 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Leaf className="h-3 w-3" />
              Biodiversity impact score
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="animate-value-in text-xl font-semibold tracking-tight">
                {result.biodiversity_impact_score}
              </span>
              <span className="text-[11px] text-muted-foreground">/ 100</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                habitat &amp; corridor loss
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/70 transition-[width] duration-500 ease-out"
                style={{ width: `${result.biodiversity_impact_score}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ---- Response curve ---- */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold">Risk response curve</h2>
          <p className="text-[10px] text-muted-foreground">
            score vs. conversion &middot; {result.zone_name ?? profile.name}
          </p>
        </div>
        <div className="mt-2 rounded-lg border border-border bg-surface-2/40 p-2">
          <RiskCurve
            curve={result.curve}
            current={pct}
            districtName={result.zone_name ?? profile.name}
            maxPct={result.max_pct}
          />
        </div>
      </section>
    </div>
  );
}
