/**
 * Time machine: two real ISRO Bhuvan land-use surveys of north-west Pune,
 * ten years apart, plus the backend's measurement of how much was built over.
 *
 * Layer names and the survey footprint mirror backend/landuse_change.py so the
 * maps can be shown straight away; the measured figures arrive from the API
 * once its one-off calculation has finished.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export const TIME_MACHINE_YEARS = [2005, 2015] as const;
export type SurveyYear = (typeof TIME_MACHINE_YEARS)[number];

export const SURVEY_LAYERS: Record<SurveyYear, string> = {
  2005: "hs:LUHS_MH_PUNE_2005",
  2015: "hs:LUHS_MH_PUNE_2015",
};

/** Where the surveys have data: Leaflet order [[south, west], [north, east]] */
export const SURVEY_BOUNDS: [[number, number], [number, number]] = [
  [18.5629, 73.6523],
  [18.8127, 73.916],
];

export const SURVEY_REGION_LABEL = "North-west Pune (Hinjewadi, Pimpri-Chinchwad)";

/** Bhuvan's official legend for these layers, for anyone who wants every class. */
export const OFFICIAL_LEGEND_URL =
  "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms?service=WMS&version=1.1.1&request=GetLegendGraphic&format=image/png&layer=hs:LUHS_MH_PUNE_2015";

/** The few colours a viewer needs, taken from that official legend. */
export const SURVEY_KEY: { label: string; color: string }[] = [
  { label: "Built-up", color: "rgb(255,0,0)" },
  { label: "Farmland", color: "rgb(255,255,181)" },
  { label: "Scrub / wasteland", color: "rgb(255,30,255)" },
  { label: "Forest", color: "rgb(38,115,0)" },
  { label: "Water", color: "rgb(0,112,255)" },
];

export interface LanduseChange {
  available: boolean;
  computing?: boolean;
  reason?: string;
  region_label?: string;
  years?: { year: number; built_up_pct: number; built_up_km2: number }[];
  change?: { pct_points: number; km2: number };
  source?: string;
}

export async function fetchLanduseChange(): Promise<LanduseChange> {
  const res = await fetch(`${API_BASE}/api/landuse-change`);
  if (!res.ok) return { available: false, reason: "The server could not provide the figures." };
  return res.json();
}
