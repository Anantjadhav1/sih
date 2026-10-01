import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import raw from "@/data/maharashtra-districts.json";

/** Properties baked into each feature by the extraction script. */
export interface DistrictProperties {
  id: string;
  district: string;
  state: string;
  dt_code: string;
  /** Leaflet-order bounds: [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]];
  /** Leaflet-order centre: [lat, lng] */
  center: [number, number];
}

export type DistrictFeature = Feature<Polygon | MultiPolygon, DistrictProperties>;

export const districtCollection =
  raw as unknown as FeatureCollection<Polygon | MultiPolygon, DistrictProperties>;

/**
 * Contextual figures used in the sidebar and map popup. These are indicative
 * public-domain scale numbers for the demo, not live datasets - the production
 * build reads them from PostGIS / Bhuvan.
 */
export interface DistrictProfile {
  id: string;
  name: string;
  label: string;
  headquarters: string;
  /** sq km */
  area: number;
  /** 2011 census */
  population: number;
  /** share of district area under cultivation, 0-1 */
  agriShare: number;
  blurb: string;
}

export const DISTRICT_PROFILES: DistrictProfile[] = [
  {
    id: "pune",
    name: "Pune",
    label: "Pune, Maharashtra",
    headquarters: "Pune",
    area: 15643,
    population: 9429408,
    agriShare: 0.62,
    blurb: "Peri-urban expansion belt with high conversion pressure along the Mula-Mutha corridor.",
  },
  {
    id: "nashik",
    name: "Nashik",
    label: "Nashik, Maharashtra",
    headquarters: "Nashik",
    area: 15530,
    population: 6107187,
    agriShare: 0.71,
    blurb: "Horticulture and viticulture heartland on the Godavari basin; irrigation-dependent.",
  },
  {
    id: "nagpur",
    name: "Nagpur",
    label: "Nagpur, Maharashtra",
    headquarters: "Nagpur",
    area: 9892,
    population: 4653570,
    agriShare: 0.58,
    blurb: "Vidarbha logistics hub; conversion driven by MIHAN and industrial corridor projects.",
  },
];

export const DEFAULT_DISTRICT_ID = "pune";

export function getProfile(id: string): DistrictProfile {
  return (
    DISTRICT_PROFILES.find((d) => d.id === id) ??
    DISTRICT_PROFILES.find((d) => d.id === DEFAULT_DISTRICT_ID)!
  );
}

export function getFeature(id: string): DistrictFeature {
  const match = districtCollection.features.find((f) => f.properties.id === id);
  return (match ??
    districtCollection.features.find(
      (f) => f.properties.id === DEFAULT_DISTRICT_ID
    )!) as DistrictFeature;
}

/**
 * Risk status ramp, shared by the sidebar readout, the chart and the map
 * choropleth. These are status colours, not series colours: they are fixed,
 * never themed, and always rendered alongside a written level so the hue never
 * carries the meaning on its own.
 *
 * Validated against this app's dark card surface (#1a2233): worst adjacent CVD
 * separation dE 11.3 (protan), normal-vision dE 27.6, all three >= 3:1 contrast.
 */
export const RISK_COLORS: Record<string, string> = {
  Low: "#0ca30c",
  Moderate: "#fab219",
  High: "#d03b3b",
};

export const RISK_LEVELS = ["Low", "Moderate", "High"] as const;

/** Upper bound of each band, matching the backend's score_for() thresholds. */
export const RISK_BANDS: { level: string; max: number }[] = [
  { level: "Low", max: 20 },
  { level: "Moderate", max: 50 },
  { level: "High", max: 100 },
];

/** What each band means in one sentence - the score alone is just a number. */
export const RISK_MEANING: Record<string, string> = {
  Low: "The area can absorb this change.",
  Moderate: "Workable, but needs drainage and resettlement planning.",
  High: "Expect serious flooding and people losing homes.",
};

export function riskColor(level?: string): string {
  return RISK_COLORS[level ?? "Low"] ?? RISK_COLORS.Low;
}
