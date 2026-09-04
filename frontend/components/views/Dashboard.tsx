"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Droplets,
  Lightbulb,
  MapPin,
  Scale,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import TrendChart from "@/components/charts/TrendChart";
import type { TrendSeries } from "@/components/charts/TrendChart";
import BarChart from "@/components/charts/BarChart";
import { REPOSITORY } from "@/lib/repository";
import { OPPORTUNITIES } from "@/lib/innovation";
import { PUNE_ZONES } from "@/lib/zones";
import { RISK_LEVELS, riskColor } from "@/lib/districts";
import { fetchZones } from "@/lib/api";
import type { ZoneSummary } from "@/lib/api";
import { useSession } from "@/lib/session";

/* Categorical slots 1-3, in fixed order - the validated all-pairs set. */
const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70"];

const TREND_YEARS = ["2021", "2022", "2023", "2024", "2025"];

/**
 * Illustrative land-use split for Pune. Static: there is no time series behind
 * this MVP, and the production build reads it from Bhuvan LULC change
 * detection across the same years.
 */
const LAND_USE_TRENDS: TrendSeries[] = [
  { id: "agri", label: "Agricultural", color: SERIES_COLORS[0], values: [62, 60, 57, 55, 52] },
  { id: "commercial", label: "Commercial", color: SERIES_COLORS[1], values: [14, 16, 18, 21, 24] },
  { id: "residential", label: "Residential", color: SERIES_COLORS[2], values: [18, 19, 21, 22, 24] },
];

/** Illustrative dispute counts. Clearly labelled as such in the card. */
const DISPUTES = [
  { label: "Wagholi", value: 1840 },
  { label: "Hadapsar", value: 1520 },
  { label: "Hinjewadi", value: 980 },
  { label: "Baner", value: 640 },
  { label: "Kothrud", value: 410 },
];

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold">{title}</h2>
        {note && (
          <p className="shrink-0 text-[10px] text-muted-foreground">{note}</p>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Band a flood-risk percentage into the same Low/Moderate/High ramp. */
function bandFor(v: number): string {
  if (v < 20) return "Low";
  if (v < 50) return "Moderate";
  return "High";
}

export default function Dashboard() {
  const { runs } = useSession();
  const [zones, setZones] = useState<ZoneSummary[] | null>(null);

  // Real baselines from the model, not restated constants
  useEffect(() => {
    let alive = true;
    fetchZones("pune")
      .then((z) => alive && setZones(z))
      .catch(() => alive && setZones([]));
    return () => {
      alive = false;
    };
  }, []);

  const resilience = useMemo(() => {
    if (!zones || zones.length === 0) return null;
    const avg =
      zones.reduce((a, z) => a + z.baseline_flood_risk_pct, 0) / zones.length;
    return {
      avg: Math.round(avg * 10) / 10,
      bars: [...zones]
        .sort((a, b) => b.baseline_flood_risk_pct - a.baseline_flood_risk_pct)
        .map((z) => ({
          label: z.name,
          value: z.baseline_flood_risk_pct,
          color: riskColor(bandFor(z.baseline_flood_risk_pct)),
        })),
    };
  }, [zones]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Platform overview for Pune district. Read-only - the interactive
            tools live in the other tabs.
          </p>
        </header>

        {/* ---- Stat row ---- */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={BookOpen}
            label="Research documents"
            value={String(REPOSITORY.length)}
            sub="papers, datasets, policy, cases"
          />
          <StatCard
            icon={SlidersHorizontal}
            label="Simulations this session"
            value={String(runs.length)}
            sub={runs.length === 0 ? "none run yet" : "across all levers"}
          />
          <StatCard
            icon={MapPin}
            label="Zones monitored"
            value={String(PUNE_ZONES.length)}
            sub="wards in Pune district"
          />
          <StatCard
            icon={Lightbulb}
            label="Open challenges"
            value={String(OPPORTUNITIES.length)}
            sub="hackathons, grants, pilots"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* ---- Land use trends ---- */}
          <Panel title="Land use trends" note="share of district area · illustrative">
            <TrendChart series={LAND_USE_TRENDS} xLabels={TREND_YEARS} />
          </Panel>

          {/* ---- Climate resilience, from real zone baselines ---- */}
          <Panel
            title="Climate resilience metrics"
            note="standing flood risk · from model"
          >
            {resilience === null ? (
              <p className="py-6 text-center text-[11px] text-muted-foreground">
                Loading zone baselines&hellip;
              </p>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight">
                    {resilience.avg}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    mean baseline across {PUNE_ZONES.length} zones, before any
                    conversion
                  </span>
                </div>
                <div className="mt-3">
                  <BarChart bars={resilience.bars} unit="%" />
                </div>
                {/* Status colour always ships with its written level */}
                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2">
                  {RISK_LEVELS.map((l) => (
                    <li key={l} className="flex items-center gap-1.5 text-[10px]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: riskColor(l) }}
                      />
                      <span className="text-muted-foreground">{l}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          {/* ---- Disputes ---- */}
          <Panel title="Land dispute statistics" note="illustrative figures">
            <BarChart bars={DISPUTES} unit=" cases" />
            <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-muted-foreground">
              Illustrative only - not sourced from a live registry. Production
              reads disposal records from the state land-records system.
            </p>
          </Panel>

          {/* ---- Activity feed ---- */}
          <Panel
            title="Recent activity"
            note={runs.length > 0 ? "this session" : undefined}
          >
            {runs.length === 0 ? (
              <div className="py-6 text-center">
                <Activity className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  No simulations yet. Runs from the Simulator tab appear here.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {runs.slice(0, 4).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-2.5 rounded-md border border-border bg-surface-2/50 px-3 py-2"
                  >
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: riskColor(r.riskLevel) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium">
                        {r.leverLabel}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.scopeLabel} &middot;{" "}
                        <span className="font-mono">{r.pct}%</span> converted
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[11px] font-semibold">
                        {r.riskScore}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.riskLevel}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <Droplets className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Climate resilience figures are pulled from the same zone table the
              Simulator runs on, so this page and the projections never disagree.
            </span>
          </p>
          <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Land-use trends and dispute counts are illustrative placeholders,
              labelled as such on each card.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
