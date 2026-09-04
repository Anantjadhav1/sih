const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export interface CurvePoint {
  pct: number;
  risk_score: number;
  risk_level: string;
}

export interface SimulationResult {
  district: string;
  district_name: string;
  /** Present only when the run was scoped to a zone */
  zone: string | null;
  zone_name: string | null;
  /** Flood exposure the zone already carries at 0% conversion; 0 district-wide */
  baseline_flood_risk_pct: number;
  agri_to_commercial_pct: number;
  predicted_flood_risk_increase_pct: number;
  predicted_displacement_persons: number;
  predicted_farmland_loss_hectares: number;
  farmland_loss_share_pct: number;
  risk_level: string;
  risk_score: number;
  /** Scenario factors echoed back, so the UI can label what produced these */
  monsoon_intensity: number;
  population_growth_rate: number;
  /** Which lever produced these numbers, and how to label its outputs */
  policy_lever: string;
  policy_lever_label: string;
  land_label: string;
  max_pct: number;
  /** 0-100 habitat impact; null for the two farmland levers */
  biodiversity_impact_score: number | null;
  /** Full 0-100% sweep for this district, 21 points. */
  curve: CurvePoint[];
}

/** Secondary scenario factors. Omitted fields fall back to the model's normals. */
export interface ScenarioFactors {
  /** 0.5-2.0, where 1.0 is the long-period average monsoon */
  monsoonIntensity?: number;
  /** 0-5 %/yr, where 1.2 is the current Maharashtra urban trend */
  populationGrowthRate?: number;
}

export async function runSimulation(
  agriToCommercialPct: number,
  district: string = "pune",
  signal?: AbortSignal,
  /** When set, scopes the projection to a zone inside the district. */
  zone?: string | null,
  factors: ScenarioFactors = {},
  policyLever?: string
): Promise<SimulationResult> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agri_to_commercial_pct: agriToCommercialPct,
      district,
      zone: zone ?? null,
      // Only send what was set; the backend's defaults are the "normal" case
      ...(factors.monsoonIntensity !== undefined
        ? { monsoon_intensity: factors.monsoonIntensity }
        : {}),
      ...(factors.populationGrowthRate !== undefined
        ? { population_growth_rate: factors.populationGrowthRate }
        : {}),
      ...(policyLever ? { policy_lever: policyLever } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error("Simulation request failed");
  return res.json();
}

export async function askCopilot(
  query: string,
  district: string = "pune",
  zone?: string | null
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/copilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, district, zone: zone ?? null }),
  });
  if (!res.ok) throw new Error("Copilot request failed");
  const data = await res.json();
  return data.response;
}

/** One zone as the backend reports it, including its standing flood baseline. */
export interface ZoneSummary {
  id: string;
  name: string;
  district: string;
  character: string;
  population: number;
  area_sq_km: number;
  agricultural_area_ha: number;
  baseline_flood_risk_pct: number;
}

/**
 * Zone reference data straight from the model. The Dashboard averages the
 * baselines from this rather than restating them, so the figure it shows is
 * the same one the simulator runs on.
 */
export async function fetchZones(district = "pune"): Promise<ZoneSummary[]> {
  const res = await fetch(`${API_BASE}/api/zones?district=${district}`);
  if (!res.ok) throw new Error("Zone request failed");
  return res.json();
}
