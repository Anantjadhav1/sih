"use client";

import { Droplets, Leaf, Sprout, TriangleAlert, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import RiskCurve from "@/components/RiskCurve";
import { Skeleton } from "@/components/ui/skeleton";
import { RISK_LEVELS, RISK_MEANING, getProfile, riskColor } from "@/lib/districts";
import type { SimulationResult } from "@/lib/api";

const nf = new Intl.NumberFormat("en-IN");

/** One headline figure. The label says what it is; the sub-line says why it matters. */
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
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span className="animate-value-in text-xl font-semibold tracking-tight">{value}</span>
        <span className="text-[11px] text-muted-foreground">{unit}</span>
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{sub}</p>
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
      <div className="p-4">
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
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[74px] w-full" />
          ))}
        </div>
        <Skeleton className="h-[168px] w-full" />
      </div>
    );
  }

  const scope = result.zone_name ?? `${profile.name} district`;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* ---- The answer ---- */}
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Result</h2>
          <span className="text-[10px] text-muted-foreground">
            {scope} &middot;{" "}
            <span className={scenarioMode === "randomized" ? "font-medium text-primary" : ""}>
              Scenario: {scenarioMode === "randomized" ? "Randomized" : "Manual"}
            </span>
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="flex items-baseline gap-1.5">
            <span
              key={result.risk_score}
              className="animate-value-in text-4xl font-semibold tracking-tight"
            >
              {result.risk_score}
            </span>
            <span className="text-sm text-muted-foreground">/ 100 risk</span>
          </p>
          {/* Status colour always ships with its written level */}
          <span
            className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{ color, borderColor: `${color}55`, backgroundColor: `${color}1a` }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {level}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{RISK_MEANING[level]}</p>

        {/* Banded meter: the two ticks are the Low/Moderate/High cut-offs */}
        <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${result.risk_score}%`, backgroundColor: color }}
          />
          <span className="absolute inset-y-0 left-[20%] w-px bg-background/70" />
          <span className="absolute inset-y-0 left-[50%] w-px bg-background/70" />
        </div>
        <div className="mt-1 grid grid-cols-[20fr_30fr_50fr] text-[10px] text-muted-foreground">
          {RISK_LEVELS.map((l) => (
            <span key={l} className={l === level ? "font-semibold text-foreground" : ""}>
              {l}
            </span>
          ))}
        </div>
      </section>

      {/* ---- Why: the three things the score is made of ---- */}
      <section className="grid grid-cols-2 gap-2">
        <StatTile
          icon={Droplets}
          label="Extra flood risk"
          value={`+${result.predicted_flood_risk_increase_pct}`}
          unit="%"
          sub={
            result.zone
              ? `on top of ${result.baseline_flood_risk_pct}% it already has`
              : "more rain running off instead of soaking in"
          }
        />
        <StatTile
          icon={Users}
          label="People displaced"
          value={nf.format(result.predicted_displacement_persons)}
          unit="people"
          sub="who would need to be resettled"
        />
        <StatTile
          icon={Sprout}
          label={result.land_label}
          value={nf.format(result.predicted_farmland_loss_hectares)}
          unit="ha"
          sub="hectares converted"
        />
        {/* Only the forest and wetland levers report habitat impact */}
        {result.biodiversity_impact_score !== null && (
          <StatTile
            icon={Leaf}
            label="Biodiversity impact"
            value={`${result.biodiversity_impact_score}`}
            unit="/ 100"
            sub="habitat and wildlife corridors lost"
          />
        )}
      </section>

      {/* ---- What if: the whole range at once ---- */}
      <section>
        <h2 className="text-xs font-semibold">How risk grows with more change</h2>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          The dot is your current choice. Hover the line to compare.
        </p>
        <div className="mt-2 rounded-lg border border-border bg-surface-2/40 p-2">
          <RiskCurve
            curve={result.curve}
            current={pct}
            districtName={scope}
            maxPct={result.max_pct}
          />
        </div>
      </section>
    </div>
  );
}
