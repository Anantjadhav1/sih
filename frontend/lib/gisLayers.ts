/**
 * GIS Explorer thematic layers.
 *
 * Each layer carries EITHER a `wms` source or a set of mock `features`. The
 * renderer checks `wms` first, so wiring a real ISRO Bhuvan service later is a
 * data change rather than a component change - drop in, for example:
 *
 *   wms: {
 *     url: "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
 *     layers: "lulc:MH_LULC50K_1516",
 *     attribution: "ISRO Bhuvan / NRSC",
 *   }
 *
 * and the mock circles for that layer stop being drawn. Bhuvan needs a token
 * and sends CORS headers only for registered origins, so the demo ships the
 * mock geometry.
 *
 * Colour assignment follows the data-viz rules rather than taste:
 *
 *   - The three THEMATIC layers are categorical (identity, not magnitude), so
 *     they take the first three validated categorical slots. Those three clear
 *     the all-pairs gate on a dark map surface (worst CVD dE 9.4, worst
 *     normal-vision dE 20.9). A fourth categorical hue does not exist that
 *     clears it - every candidate failed the normal-vision floor, which is a
 *     hard failure that secondary encoding cannot excuse.
 *   - Population Density is therefore NOT a fourth category. It is a magnitude,
 *     so it correctly takes a SEQUENTIAL ramp, rendered in neutral grey beneath
 *     the thematic marks. Grey cannot be confused with the three hues under any
 *     colour-vision deficiency, and the ramp reads as a background field rather
 *     than a competing series.
 */

export interface WmsSource {
  url: string;
  layers: string;
  format?: string;
  transparent?: boolean;
  attribution?: string;
}

export interface MockFeature {
  /** Leaflet order: [lat, lng] */
  center: [number, number];
  radiusM: number;
  label: string;
  value: string;
  /** 0-1, drives the ramp step on sequential layers */
  weight: number;
}

export interface GisLayer {
  id: string;
  name: string;
  encoding: "categorical" | "sequential";
  /** Categorical hue, or the darkest step for a sequential ramp */
  color: string;
  legend: string;
  description: string;
  source: string;
  wms?: WmsSource;
  features: MockFeature[];
}

export const GIS_LAYERS: GisLayer[] = [
  {
    id: "lulc",
    name: "Land Use / Land Cover",
    encoding: "categorical",
    color: "#3987e5", // categorical slot 1
    legend: "Built-up expansion class",
    description: "1:50,000 LULC classification, decadal change detection",
    source: "ISRO Bhuvan LULC 50K",
    features: [
      { center: [18.5913, 73.7389], radiusM: 3400, label: "Hinjewadi", value: "Built-up, high density", weight: 0.9 },
      { center: [18.5074, 73.8077], radiusM: 2600, label: "Kothrud", value: "Built-up, saturated", weight: 0.95 },
      { center: [18.5089, 73.926], radiusM: 3800, label: "Hadapsar", value: "Industrial / mixed", weight: 0.75 },
      { center: [18.5793, 73.9784], radiusM: 4200, label: "Wagholi", value: "Cropland in transition", weight: 0.45 },
      { center: [18.4088, 73.8553], radiusM: 3000, label: "Katraj ridge", value: "Scrub / forest", weight: 0.2 },
    ],
  },
  {
    id: "climate",
    name: "Climate Vulnerability",
    encoding: "categorical",
    color: "#d95926", // categorical slot 2
    legend: "Composite vulnerability index",
    description: "Downscaled precipitation extremes joined to settlement density",
    source: "IITM / CWC flood lines",
    features: [
      { center: [18.5089, 73.926], radiusM: 4600, label: "Mula-Mutha floodplain", value: "Index 0.82 - severe", weight: 0.82 },
      { center: [18.5236, 73.8478], radiusM: 3200, label: "Central Pune riverfront", value: "Index 0.68 - high", weight: 0.68 },
      { center: [18.5793, 73.9784], radiusM: 3600, label: "Wagholi nullah belt", value: "Index 0.54 - moderate", weight: 0.54 },
      { center: [18.5642, 73.7769], radiusM: 2400, label: "Baner slopes", value: "Index 0.31 - low", weight: 0.31 },
      { center: [18.7606, 73.8636], radiusM: 3000, label: "Chakan plateau", value: "Index 0.24 - low", weight: 0.24 },
    ],
  },
  {
    id: "infrastructure",
    name: "Infrastructure Development",
    encoding: "categorical",
    color: "#199e70", // categorical slot 3
    legend: "Committed capital projects",
    description: "Sanctioned corridors, interchanges and logistics nodes",
    source: "PMRDA / MSRDC project register",
    features: [
      { center: [18.5679, 73.9143], radiusM: 2800, label: "Pune Metro Line 2", value: "Operational", weight: 1 },
      { center: [18.5913, 73.7389], radiusM: 2200, label: "Hinjewadi-Shivajinagar Metro", value: "Under construction", weight: 0.8 },
      { center: [18.6298, 73.8131], radiusM: 3400, label: "Ring Road - west arc", value: "Land acquisition", weight: 0.6 },
      { center: [18.5822, 73.9197], radiusM: 2000, label: "Lohegaon airport expansion", value: "Sanctioned", weight: 0.7 },
      { center: [18.7606, 73.8636], radiusM: 3200, label: "Chakan industrial cluster", value: "Operational", weight: 1 },
    ],
  },
  {
    id: "population",
    name: "Population Density",
    encoding: "sequential",
    color: "#d4d4d8", // ramp top; steps computed from weight
    legend: "Persons per km²",
    description: "Census 2011 ward density, projected to 2024",
    source: "Census of India / PMC ward register",
    features: [
      { center: [18.5074, 73.8077], radiusM: 3000, label: "Kothrud", value: "22,800 /km²", weight: 1.0 },
      { center: [18.5236, 73.8478], radiusM: 2800, label: "Shivajinagar", value: "19,400 /km²", weight: 0.85 },
      { center: [18.5089, 73.926], radiusM: 3600, label: "Hadapsar", value: "8,500 /km²", weight: 0.55 },
      { center: [18.5913, 73.7389], radiusM: 3400, label: "Hinjewadi", value: "8,900 /km²", weight: 0.58 },
      { center: [18.5642, 73.7769], radiusM: 2600, label: "Baner", value: "7,900 /km²", weight: 0.5 },
      { center: [18.5793, 73.9784], radiusM: 3800, label: "Wagholi", value: "4,500 /km²", weight: 0.28 },
    ],
  },
];

/**
 * Neutral sequential ramp for the density layer, light -> dark by magnitude.
 * Kept greyscale on purpose: see the colour note at the top of this file.
 */
const DENSITY_RAMP = ["#52525b", "#71717a", "#a1a1aa", "#d4d4d8"];

export function sequentialStep(weight: number): string {
  const i = Math.min(
    DENSITY_RAMP.length - 1,
    Math.max(0, Math.round(weight * (DENSITY_RAMP.length - 1)))
  );
  return DENSITY_RAMP[i];
}

export function layerColor(layer: GisLayer, feature: MockFeature): string {
  return layer.encoding === "sequential"
    ? sequentialStep(feature.weight)
    : layer.color;
}

export { DENSITY_RAMP };
