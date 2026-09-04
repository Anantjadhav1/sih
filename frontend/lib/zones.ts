/**
 * Zone geography for the simulator's map markers.
 *
 * Coordinates and display copy live here; the risk coefficients that actually
 * drive the projection (standing flood baseline, convertible share, sensitivity)
 * live in the backend's ZONES table and reach the UI only through
 * /api/simulate. Keeping them server-side means the map never implies a number
 * the model didn't produce.
 */
export interface Zone {
  id: string;
  name: string;
  districtId: string;
  /** Leaflet order: [lat, lng] */
  center: [number, number];
  character: string;
  /** Zoom used when the map moves to this zone */
  zoom: number;
  /** Nominal footprint radius in metres, from the zone's area in the backend */
  radiusM: number;
}

export const PUNE_ZONES: Zone[] = [
  {
    id: "hinjewadi",
    name: "Hinjewadi",
    districtId: "pune",
    center: [18.5913, 73.7389],
    character: "IT corridor - Rajiv Gandhi Infotech Park",
    zoom: 13,
    radiusM: 3190,
  },
  {
    id: "baner",
    name: "Baner",
    districtId: "pune",
    center: [18.5642, 73.7769],
    character: "Fast-growing hill-slope suburb",
    zoom: 13,
    radiusM: 2760,
  },
  {
    id: "kothrud",
    name: "Kothrud",
    districtId: "pune",
    center: [18.5074, 73.8077],
    character: "Dense residential, largely built out",
    zoom: 13,
    radiusM: 2390,
  },
  {
    id: "hadapsar",
    name: "Hadapsar",
    districtId: "pune",
    center: [18.5089, 73.926],
    character: "Eastern industrial belt on the Mula-Mutha floodplain",
    zoom: 13,
    radiusM: 3610,
  },
  {
    id: "wagholi",
    name: "Wagholi",
    districtId: "pune",
    center: [18.5793, 73.9784],
    character: "Peri-urban expansion frontier",
    zoom: 13,
    radiusM: 3430,
  },
];

export function zonesForDistrict(districtId: string): Zone[] {
  return PUNE_ZONES.filter((z) => z.districtId === districtId);
}

export function getZone(id: string | null): Zone | undefined {
  return id ? PUNE_ZONES.find((z) => z.id === id) : undefined;
}
