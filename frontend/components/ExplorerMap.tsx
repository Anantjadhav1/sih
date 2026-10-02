"use client";

import { useEffect, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Pane,
  TileLayer,
  Tooltip,
  WMSTileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { GIS_LAYERS, layerColor } from "@/lib/gisLayers";
import { RISK_COLORS, getFeature, getProfile } from "@/lib/districts";
import { BHUVAN_WMS_URL, bhuvanLayerFor } from "@/lib/bhuvan";
import { photoUrl } from "@/lib/groundTruth";
import {
  SURVEY_BOUNDS,
  SURVEY_KEY,
  SURVEY_LAYERS,
  TIME_MACHINE_YEARS,
} from "@/lib/timeMachine";
import type { ExplorerMapProps } from "@/components/maps/loaders";

/**
 * While placing a citizen photo, a map click picks its location. The cursor
 * turns into a crosshair so it is obvious the next click does something.
 */
function PickLocation({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick?: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (enabled) onPick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    map.getContainer().style.cursor = enabled ? "crosshair" : "";
  }, [map, enabled]);
  return null;
}

const FIT_PADDING: [number, number] = [36, 36];

/** Frames the district once the container has real dimensions. */
function FitDistrict({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    const container = map.getContainer();
    const fit = (): boolean => {
      if (container.clientWidth < 50 || container.clientHeight < 50) return false;
      if (!hasFitted.current) {
        map.invalidateSize();
        hasFitted.current = true;
      }
      // Not animated: an animated zoom can leave the old zoom level's tiles
      // magnified on screen (see the note in PolicyMap)
      map.fitBounds(bounds, { padding: FIT_PADDING, animate: false });
      return true;
    };
    if (fit()) return;
    const observer = new ResizeObserver(() => {
      if (fit()) observer.disconnect();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map, bounds]);

  return null;
}

// See PolicyMap for why each map instance needs its own container key.
let explorerSeq = 0;

export default function ExplorerMap({
  districtId,
  activeLayerIds,
  bhuvanStatus = "fallback",
  onBhuvanFailure,
  observations = [],
  showObservations = true,
  pickMode = false,
  draftLocation = null,
  onPick,
  timeYear = null,
}: ExplorerMapProps) {
  const [mapKey] = useState(() => `explorer-map-${explorerSeq++}`);
  const feature = getFeature(districtId);
  const profile = getProfile(districtId);

  // While the time machine is on, the thematic layers step aside so the two
  // surveys can be compared without anything drawn over them
  const active = timeYear
    ? []
    : GIS_LAYERS.filter((l) => activeLayerIds.includes(l.id));

  /*
   * The LULC layer is the only one with a real upstream service. It renders as
   * live Bhuvan WMS tiles only when the probe in GisExplorer succeeded AND this
   * district actually has a published Bhuvan layer; anything else keeps the
   * mock geometry. Tiles that fail AFTER we have gone live are caught by the
   * tileerror handler below, which hands control back to the fallback - so a
   * mid-demo Bhuvan outage degrades to the mock layer instead of a blank map.
   */
  const bhuvanLayer = bhuvanLayerFor(districtId);
  const useLiveLulc = bhuvanStatus === "live" && bhuvanLayer !== null;

  return (
    <MapContainer
      key={mapKey}
      center={feature.properties.center}
      zoom={9}
      scrollWheelZoom
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &middot; Thematic layers: mock data for demo'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
        className="basemap-tint"
      />

      <ZoomControl position="topright" />
      <FitDistrict bounds={timeYear ? SURVEY_BOUNDS : feature.properties.bounds} />

      {/*
        Time machine: both survey years load together and only their opacity
        changes, so flipping between 2005 and 2015 (or pressing Play) is
        instant instead of waiting on a fresh set of tiles each time.
      */}
      {timeYear &&
        TIME_MACHINE_YEARS.map((year) => (
          <WMSTileLayer
            key={`survey-${year}`}
            url={BHUVAN_WMS_URL}
            layers={SURVEY_LAYERS[year]}
            format="image/png"
            transparent
            version="1.1.1"
            opacity={year === timeYear ? 0.85 : 0}
            // Only request tiles over the survey: outside it Bhuvan returns
            // blank tiles carrying just its watermark, which clutters the map
            bounds={SURVEY_BOUNDS}
            attribution="Land use surveys &copy; ISRO Bhuvan / NRSC"
            eventHandlers={{ tileerror: () => onBhuvanFailure?.() }}
          />
        ))}

      {/*
        Sequential layers draw first so the categorical thematic marks sit on
        top of the density field rather than being swallowed by it.
      */}
      {[...active]
        .sort((a, b) => (a.encoding === "sequential" ? -1 : 1))
        .map((layer) =>
          layer.id === "lulc" && useLiveLulc ? (
            <WMSTileLayer
              key="lulc-bhuvan"
              url={BHUVAN_WMS_URL}
              layers={bhuvanLayer as string}
              format="image/png"
              transparent
              version="1.1.1"
              opacity={0.72}
              attribution="LULC &copy; ISRO Bhuvan / NRSC"
              eventHandlers={{
                tileerror: () => {
                  // Bhuvan answered the probe but is failing now. Drop to the
                  // mock layer rather than leaving holes in the map.
                  onBhuvanFailure?.();
                },
              }}
            />
          ) : layer.wms ? (
            // A real Bhuvan service, when one is configured for this layer
            <WMSTileLayer
              key={layer.id}
              url={layer.wms.url}
              layers={layer.wms.layers}
              format={layer.wms.format ?? "image/png"}
              transparent={layer.wms.transparent ?? true}
              attribution={layer.wms.attribution}
              opacity={0.7}
            />
          ) : (
            <div key={layer.id}>
              {layer.features.map((f) => (
                <Circle
                  key={`${layer.id}-${f.label}`}
                  center={f.center}
                  radius={f.radiusM}
                  pathOptions={{
                    color: layerColor(layer, f),
                    weight: layer.encoding === "sequential" ? 0 : 2,
                    fillColor: layerColor(layer, f),
                    // The density field stays faint; thematic marks stay crisp
                    fillOpacity:
                      layer.encoding === "sequential" ? 0.18 + f.weight * 0.2 : 0.22,
                  }}
                >
                  <Tooltip direction="top" className="district-tooltip">
                    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-card-foreground shadow-xl">
                      <p className="flex items-center gap-1.5 text-xs font-semibold">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: layerColor(layer, f) }}
                        />
                        {f.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {f.value}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {layer.name}
                      </p>
                    </div>
                  </Tooltip>
                </Circle>
              ))}
            </div>
          )
        )}

      <Pane name="labels" style={{ zIndex: 650, pointerEvents: "none" }}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
      </Pane>

      <PickLocation enabled={pickMode} onPick={onPick} />

      {/*
        Citizen photo pins sit above the place-name labels so they stay
        clickable. Neutral white rather than a layer hue: these are evidence
        points, not one of the thematic layers, and a failed integrity check
        turns the ring red (with the reason written in the tooltip).
      */}
      <Pane name="citizen-pins" style={{ zIndex: 660 }}>
        {showObservations &&
          observations.map((o) => {
            const ok = o.photo_intact && o.block_intact;
            return (
              <CircleMarker
                key={o.block_index}
                center={[o.lat, o.lng]}
                radius={7}
                pathOptions={{
                  color: ok ? "#0b1220" : RISK_COLORS.High,
                  weight: ok ? 2 : 3,
                  fillColor: "#ffffff",
                  fillOpacity: 0.95,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} className="district-tooltip">
                  <div className="w-52 rounded-md border border-border bg-card p-2 text-card-foreground shadow-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl(o.photo_file)}
                      alt={`${o.category} reported by a citizen`}
                      className="h-28 w-full rounded object-cover"
                    />
                    <p className="mt-1.5 text-xs font-semibold">{o.category}</p>
                    {o.note && (
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                        {o.note}
                      </p>
                    )}
                    <p
                      className="mt-1 text-[10px] font-medium"
                      style={{ color: ok ? RISK_COLORS.Low : RISK_COLORS.High }}
                    >
                      {ok
                        ? `✓ Photo matches its blockchain fingerprint (Block #${o.block_index})`
                        : !o.photo_intact
                          ? "✗ Photo file was changed after it was sealed"
                          : `✗ Block #${o.block_index} failed verification`}
                    </p>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

        {draftLocation && (
          <CircleMarker
            center={draftLocation}
            radius={9}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              dashArray: "3 3",
              fillColor: "#3987e5",
              fillOpacity: 0.6,
            }}
          />
        )}
      </Pane>

      <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur-md">
        {timeYear ? (
          <>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Time machine
            </p>
            {/* The year is the headline - it's what changes when you press Play */}
            <p className="mt-0.5 font-mono text-2xl font-semibold leading-none">{timeYear}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              North-west Pune &middot; ISRO land use survey
            </p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Extent
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-tight">
              {profile.name} District
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              {active.length} of {GIS_LAYERS.length} layers active
            </p>
          </>
        )}
      </div>

      {/* Survey colours, from Bhuvan's official legend */}
      {timeYear && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur-md">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Land use
          </p>
          <ul className="mt-1.5 space-y-1">
            {SURVEY_KEY.map((k) => (
              <li key={k.label} className="flex items-center gap-1.5 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-black/20"
                  style={{ backgroundColor: k.color }}
                />
                {k.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Legend names every active layer, so colour never carries identity alone */}
      {!timeYear && (active.length > 0 || (showObservations && observations.length > 0)) && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[15rem] rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur-md">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Active layers
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {showObservations && observations.length > 0 && (
              <li className="text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[#0b1220] bg-white" />
                  <span className="font-medium">Citizen photos ({observations.length})</span>
                </span>
                <span className="ml-4 block text-[10px] text-muted-foreground">
                  hover a pin to see the photo
                </span>
              </li>
            )}
            {active.map((l) => (
              <li key={l.id} className="text-xs">
                <span className="flex items-center gap-1.5">
                  {l.encoding === "sequential" ? (
                    // Graduated swatch strip: this layer encodes magnitude
                    <span className="flex h-2.5 w-8 shrink-0 overflow-hidden rounded-sm">
                      {[0, 0.33, 0.66, 1].map((w) => (
                        <span
                          key={w}
                          className="h-full flex-1"
                          style={{ backgroundColor: layerColor(l, { weight: w } as never) }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-white/15"
                      style={{ backgroundColor: l.color }}
                    />
                  )}
                  <span className="font-medium">{l.name}</span>
                </span>
                <span className="ml-[2.375rem] block text-[10px] text-muted-foreground">
                  {l.legend}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </MapContainer>
  );
}
