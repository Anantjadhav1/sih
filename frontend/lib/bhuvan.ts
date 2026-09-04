/**
 * ISRO Bhuvan WMS integration for the GIS Explorer's Land Use / Land Cover layer.
 *
 * This is a REAL service, not a mock. Verified reachable without auth:
 *
 *   GET https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms
 *       ?service=WMS&version=1.1.1&request=GetMap
 *       &layers=sisdpv2:MH_Pune_lulc_v2&srs=EPSG:4326&format=image/png
 *   -> 200 image/png, ~105 KB per 256px tile, ~1.2s
 *
 * Other Bhuvan hosts were probed and rejected: bhuvan-app1 and bhuvan-ras2
 * return 404 on every WMS path, bhuvan-ras1 returns 403 to anonymous clients,
 * and bhuvan-vec2 times out. The GeoWebCache endpoint on vec1
 * (/bhuvan/gwc/service/wms) answers GetCapabilities but 302s on GetMap, so the
 * plain /bhuvan/wms endpoint is the one wired up here.
 *
 * Availability is genuinely inconsistent, which is why nothing in the UI
 * depends on it: see probeBhuvan() and the fallback path in ExplorerMap.
 */

export const BHUVAN_WMS_URL = "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms";

/**
 * Per-district LULC layer names, read from Bhuvan's own GetCapabilities
 * document. Districts absent from this map simply have no live layer and fall
 * back, which is the same path a network failure takes.
 */
export const BHUVAN_LULC_LAYERS: Record<string, string> = {
  pune: "sisdpv2:MH_Pune_lulc_v2",
  nashik: "sisdpv2:MH_Nashik_lulc_v2",
  nagpur: "sisdpv2:MH_Nagpur_lulc_v2",
};

export function bhuvanLayerFor(districtId: string): string | null {
  return BHUVAN_LULC_LAYERS[districtId] ?? null;
}

/** How long to wait for the probe tile before declaring Bhuvan unreachable. */
const PROBE_TIMEOUT_MS = 9000;

export type BhuvanStatus = "probing" | "live" | "fallback";

/**
 * Ask Bhuvan for one small tile and see whether it arrives.
 *
 * Deliberately uses an Image rather than fetch(): Leaflet renders tiles as
 * <img> elements, which are not subject to CORS, so this probe exercises
 * exactly the same path the real tiles will take. A fetch() probe could fail on
 * CORS while the actual tiles render perfectly, which would send us to the
 * fallback for no reason.
 *
 * Resolves false rather than rejecting - callers treat "unreachable" as a
 * normal branch, not an error.
 */
export function probeBhuvan(districtId: string): Promise<boolean> {
  const layer = bhuvanLayerFor(districtId);
  if (layer === null) return Promise.resolve(false);
  if (typeof window === "undefined") return Promise.resolve(false);

  const url =
    `${BHUVAN_WMS_URL}?service=WMS&version=1.1.1&request=GetMap` +
    `&layers=${encodeURIComponent(layer)}&styles=&format=image/png` +
    `&transparent=true&srs=EPSG:4326&bbox=73.7,18.4,74.0,18.7` +
    `&width=64&height=64&_probe=${Date.now()}`;

  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      clearTimeout(timer);
      resolve(ok);
    };

    const timer = setTimeout(() => {
      // Bhuvan answers slowly under load; a timeout is the common failure, not
      // an HTTP error, so it has to be handled explicitly.
      img.src = "";
      finish(false);
    }, PROBE_TIMEOUT_MS);

    img.onload = () => finish(img.naturalWidth > 0);
    img.onerror = () => finish(false);
    img.src = url;
  });
}
