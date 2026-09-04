/**
 * Policy lever catalogue for the Simulator's selector.
 *
 * The backend's POLICY_LEVERS table is authoritative for the maths and is also
 * exposed at GET /api/levers (alongside /api/districts and /api/zones). This
 * mirror carries only what the selector needs to render - id, label, one-line
 * rationale, slider ceiling - so the control paints instantly instead of
 * waiting on a round trip. Keep the ids and max values in step with the backend.
 */
export interface PolicyLever {
  id: string;
  /** Short label for the selector chip */
  label: string;
  /** Full label as the backend reports it */
  fullLabel: string;
  /** One-line real-world explanation shown under the selection */
  explanation: string;
  /** What the land-take stat tile should be called for this lever */
  landLabel: string;
  /** Slider ceiling - wetlands are capped far below the others */
  maxPct: number;
  /** Whether this lever reports a Biodiversity Impact Score */
  hasBiodiversity: boolean;
}

export const POLICY_LEVERS: PolicyLever[] = [
  {
    id: "agri_commercial",
    label: "Agri → Commercial",
    fullLabel: "Agricultural to Commercial Conversion",
    explanation:
      "Farmland rezoned for malls, offices and warehousing - the standard peri-urban conversion.",
    landLabel: "Farmland loss",
    maxPct: 100,
    hasBiodiversity: false,
  },
  {
    id: "agri_residential",
    label: "Agri → Residential",
    fullLabel: "Agricultural to Residential Conversion",
    explanation:
      "Farmland rezoned for housing - more people per hectare, but gardens and setbacks absorb more rain than a retail slab.",
    landLabel: "Farmland loss",
    maxPct: 100,
    hasBiodiversity: false,
  },
  {
    id: "forest_urban",
    label: "Forest → Urban",
    fullLabel: "Forest / Green Cover to Urban Expansion",
    explanation:
      "Built-up expansion into the Sahyadri green belt - removes the catchment's own water absorption, so impact compounds.",
    landLabel: "Green cover lost",
    maxPct: 100,
    hasBiodiversity: true,
  },
  {
    id: "wetland_encroachment",
    label: "Wetland encroachment",
    fullLabel: "Wetland / Water Body Encroachment",
    explanation:
      "Building on floodplain and lake margins - the land that stores monsoon water. Small encroachments remove disproportionate storage.",
    landLabel: "Wetland lost",
    // Beyond ~40% there is no wetland left to model, so the lever stops there
    maxPct: 40,
    hasBiodiversity: true,
  },
];

export const DEFAULT_LEVER_ID = "agri_commercial";

export function getLever(id: string): PolicyLever {
  return POLICY_LEVERS.find((l) => l.id === id) ?? POLICY_LEVERS[0];
}
