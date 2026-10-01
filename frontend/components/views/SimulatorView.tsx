"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PolicySidebar from "@/components/PolicySidebar";
import InsightsPanel from "@/components/InsightsPanel";
import CopilotChat from "@/components/CopilotChat";
import RecordDecision from "@/components/RecordDecision";
import { usePolicyMap } from "@/components/maps/loaders";
import { runSimulation, SimulationResult } from "@/lib/api";
import { DEFAULT_DISTRICT_ID, getProfile } from "@/lib/districts";
import { zonesForDistrict } from "@/lib/zones";
import { DEFAULT_LEVER_ID, getLever } from "@/lib/levers";
import { useSession } from "@/lib/session";

export default function SimulatorView({
  onScopeChange,
  onOpenLedger,
}: {
  /** Lets the shell show the active scope in its breadcrumb. */
  onScopeChange?: (label: string) => void;
  /** Jump to the Blockchain Ledger tab after sealing a decision. */
  onOpenLedger?: () => void;
}) {
  const PolicyMap = usePolicyMap();
  const { recordRun } = useSession();
  const [districtId, setDistrictId] = useState(DEFAULT_DISTRICT_ID);
  const [leverId, setLeverId] = useState(DEFAULT_LEVER_ID);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [pct, setPct] = useState(25);
  // Secondary factors, seeded at the model's "normal" values so the opening
  // view reproduces the district baseline exactly.
  const [monsoon, setMonsoon] = useState(1.0);
  const [growth, setGrowth] = useState(1.2);
  const [scenarioMode, setScenarioMode] = useState<"manual" | "randomized">("manual");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep only the newest in-flight request; dragging the slider fires several
  const inFlight = useRef<AbortController | null>(null);

  const simulate = useCallback(
    async (
      value: number,
      district: string,
      zone: string | null,
      factors: { monsoonIntensity: number; populationGrowthRate: number },
      lever: string
    ) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setLoading(true);
      setError(null);
      try {
        const data = await runSimulation(
          value,
          district,
          controller.signal,
          zone,
          factors,
          lever
        );
        if (controller.signal.aborted) return;
        setResult(data);
        setLoading(false);
        // Feeds the Dashboard's counter and activity list
        recordRun({
          leverId: data.policy_lever,
          leverLabel: data.policy_lever_label,
          scopeLabel: data.zone_name ?? `${data.district_name} district`,
          pct: data.agri_to_commercial_pct,
          riskScore: data.risk_score,
          riskLevel: data.risk_level,
        });
      } catch (e) {
        if (controller.signal.aborted || (e as Error).name === "AbortError") return;
        setError("Could not reach simulation backend. Is FastAPI running on :8000?");
        setLoading(false);
      }
    },
    [recordRun]
  );

  // Run on first paint and whenever the scope (district or zone) changes
  useEffect(() => {
    simulate(
      pct,
      districtId,
      zoneId,
      { monsoonIntensity: monsoon, populationGrowthRate: growth },
      leverId
    );
    // Slider values are intentionally omitted: they commit via onValueCommit
    // rather than firing a request on every drag frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtId, zoneId, leverId, simulate]);

  /** Re-run with whatever the sliders currently hold. */
  const rerun = useCallback(
    (
      nextPct = pct,
      nextMonsoon = monsoon,
      nextGrowth = growth,
      zone = zoneId
    ) =>
      simulate(
        nextPct,
        districtId,
        zone,
        { monsoonIntensity: nextMonsoon, populationGrowthRate: nextGrowth },
        leverId
      ),
    [simulate, pct, monsoon, growth, districtId, zoneId, leverId]
  );

  /**
   * Draw a fresh scenario across all three levers at once. Ranges are the same
   * ones the sliders expose, so a randomized scenario is always one a user
   * could have dialled in by hand.
   */
  function randomize() {
    const rand = (min: number, max: number, step: number) => {
      const steps = Math.round((max - min) / step);
      return +(min + Math.round(Math.random() * steps) * step).toFixed(2);
    };
    // Draw within the active lever's own range, not a fixed 0-100
    const nextPct = rand(0, getLever(leverId).maxPct, 1);
    const nextMonsoon = rand(0.5, 2, 0.05);
    const nextGrowth = rand(0, 5, 0.1);
    setPct(nextPct);
    setMonsoon(nextMonsoon);
    setGrowth(nextGrowth);
    setScenarioMode("randomized");
    rerun(nextPct, nextMonsoon, nextGrowth);
  }

  const profile = getProfile(districtId);
  const zones = zonesForDistrict(districtId);
  const activeZone = zones.find((z) => z.id === zoneId) ?? null;

  // Changing district drops any zone selection - zones belong to one district
  function handleDistrictChange(id: string) {
    setZoneId(null);
    setDistrictId(id);
  }

  /**
   * Levers have different ceilings, so switching from a 100% lever to the
   * 40% wetland one has to pull the slider back inside range before the
   * next run, or the backend would silently clamp it and the UI would show
   * a position that never happened.
   */
  function handleLeverChange(id: string) {
    const nextMax = getLever(id).maxPct;
    if (pct > nextMax) setPct(nextMax);
    setScenarioMode("manual");
    setLeverId(id);
  }

  useEffect(() => {
    onScopeChange?.(activeZone ? `${profile.name} › ${activeZone.name}` : profile.name);
  }, [onScopeChange, profile.name, activeZone]);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <PolicySidebar
        districtId={districtId}
        onDistrictChange={handleDistrictChange}
        pct={pct}
        onPctChange={(v) => {
          setPct(v);
          setScenarioMode("manual");
        }}
        onPctCommit={(v) => rerun(v)}
        monsoon={monsoon}
        onMonsoonChange={(v) => {
          setMonsoon(v);
          setScenarioMode("manual");
        }}
        growth={growth}
        onGrowthChange={(v) => {
          setGrowth(v);
          setScenarioMode("manual");
        }}
        onCommitFactors={() => rerun()}
        onRandomize={randomize}
        scenarioMode={scenarioMode}
        leverId={leverId}
        onLeverChange={handleLeverChange}
        zones={zones}
        selectedZoneId={zoneId}
        onSelectZone={setZoneId}
        result={result}
      />

      {/* Map is the centrepiece - it gets all the leftover width */}
      <div className="relative min-h-[24rem] flex-1 lg:min-h-0">
        {PolicyMap ? (
          <PolicyMap
            districtId={districtId}
            riskLevel={result?.risk_level ?? "Low"}
            result={result}
            zones={zones}
            selectedZoneId={zoneId}
            onSelectZone={setZoneId}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-1 text-xs text-muted-foreground">
            Loading basemap&hellip;
          </div>
        )}
      </div>

      {/* Right rail: results, then the decision, with the co-pilot folded below */}
      <div className="flex w-full shrink-0 flex-col overflow-hidden border-border bg-surface-1 lg:w-[22rem] lg:border-l">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <InsightsPanel
            districtId={districtId}
            pct={pct}
            result={result}
            loading={loading}
            error={error}
            scenarioMode={scenarioMode}
          />
          <div className="px-4 pb-4">
            <RecordDecision
              scenario={{
                pct,
                district: districtId,
                zone: zoneId,
                lever: leverId,
                monsoonIntensity: monsoon,
                populationGrowthRate: growth,
              }}
              disabled={loading || !result || error !== null}
              onOpenLedger={onOpenLedger}
            />
          </div>
        </div>
        <CopilotChat
          districtId={districtId}
          districtName={activeZone ? activeZone.name : profile.name}
          zoneId={zoneId}
        />
      </div>
    </div>
  );
}
