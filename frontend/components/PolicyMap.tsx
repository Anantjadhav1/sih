"use client";

import { useEffect, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  TileLayer,
  GeoJSON,
  Pane,
  Tooltip,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression, PathOptions } from "leaflet";
import { RISK_LEVELS, getFeature, getProfile, riskColor } from "@/lib/districts";
import type { SimulationResult } from "@/lib/api";
import type { Zone } from "@/lib/zones";

interface PolicyMapProps {
  districtId: string;
  riskLevel: string;
  result: SimulationResult | null;
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
}

const FIT_PADDING: [number, number] = [36, 36];

/**
 * Frames whatever is currently in scope: the whole district, or - once a zone
 * marker is picked - that zone.
 */
function FitTarget({
  bounds,
  zone,
}: {
  bounds: LatLngBoundsExpression;
  zone: Zone | null;
}) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    const container = map.getContainer();

    const fit = (): boolean => {
      // Next injects the stylesheet after hydration in dev, so the container
      // can still be 0x0 on the first effect pass. Fitting against a zero-size
      // container makes getBoundsZoom return NaN, which throws
      // "Invalid LatLng object: (NaN, NaN)" and strands the tile layer.
      if (container.clientWidth < 50 || container.clientHeight < 50) return false;

      if (!hasFitted.current) {
        // The container only just gained its size, so Leaflet's cached
        // dimensions are stale - refresh them before the first framing.
        map.invalidateSize();
        hasFitted.current = true;
      }
      if (zone) {
        // setView with animate:false, for the same reason fitBounds is used
        // below. An animated flyTo here leaves Leaflet holding the pre-zoom
        // tile level: it retains the old container (a z8 tile transformed 32x)
        // and never prunes it once the new level loads, so a hugely magnified,
        // blurred label sits over the correct tiles. Jumping straight to the
        // target skips the retained level entirely.
        map.setView(zone.center, zone.zoom, { animate: false });
        return true;
      }

      // fitBounds, not flyToBounds: the animated fly between districts several
      // hundred km apart leaves the tile layer showing the previous district's
      // tiles until the next manual pan/zoom.
      map.fitBounds(bounds, { padding: FIT_PADDING });
      return true;
    };

    if (fit()) return;

    const observer = new ResizeObserver(() => {
      if (fit()) observer.disconnect();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map, bounds, zone]);

  return null;
}

/**
 * Monotonic id handed to each PolicyMap instance. Module scope, so it survives
 * component remounts and never repeats within a page session.
 */
let mapInstanceSeq = 0;

export default function PolicyMap({
  districtId,
  riskLevel,
  result,
  zones,
  selectedZoneId,
  onSelectZone,
}: PolicyMapProps) {
  /*
   * react-leaflet 4.2.1 builds its map inside a useCallback([], ...) whose
   * closure captures `context` as null permanently, so the guard that should
   * stop a re-init never fires and its unmount cleanup reads that same stale
   * null. If React ever remounts this component onto the DOM node it already
   * used, Leaflet sees its own _leaflet_id still on the node and throws
   * ("Map container is already initialized", then "is being reused by another
   * instance" when the stale cleanup finally runs) - which reaches the root
   * error boundary and takes the whole dashboard down before React retries.
   *
   * Keying the MapContainer per instance makes that unreachable: a remount is a
   * new instance, so it gets a new key, so React builds a brand-new div rather
   * than recycling the stamped one. Each Leaflet map then owns its container
   * for that container's whole life.
   */
  const [mapKey] = useState(() => `leaflet-map-${mapInstanceSeq++}`);

  const feature = getFeature(districtId);
  const profile = getProfile(districtId);
  const color = riskColor(riskLevel);

  // Fill opacity tracks the conversion intensity so the choropleth "deepens"
  // as the policy lever is pushed, on top of the low/moderate/high hue shift.
  const intensity = result ? result.agri_to_commercial_pct / 100 : 0;
  const activeZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  // With a zone in scope the district outline becomes context, not the subject:
  // at zone zoom its fill would otherwise flood the entire viewport.
  const style: PathOptions = {
    color,
    weight: 2,
    opacity: activeZone ? 0.5 : 1,
    fillColor: color,
    fillOpacity: activeZone ? 0.04 : 0.14 + intensity * 0.4,
  };

  // Drawn beneath the boundary to give it a soft halo against the dark basemap.
  const glowStyle: PathOptions = {
    color,
    weight: 12,
    opacity: 0.16,
    fill: false,
  };

  return (
    <MapContainer
      key={mapKey}
      // Framing is owned entirely by <FitTarget/>, which waits for the
      // container to be measured; center/zoom here are just a safe seed.
      center={feature.properties.center}
      zoom={9}
      scrollWheelZoom
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      {/*
        Dark basemap without labels. Place names come back in on their own pane
        ABOVE the choropleth (z 650 > overlayPane's 400), so town and city names
        stay readable through the risk shading instead of being buried by it.

        Esri's Dark Gray Canvas is used rather than CARTO's dark_nolabels:
        CARTO now stamps "API KEY REQUIRED" across every keyless tile. Esri's
        canvas services serve anonymously. Note the {z}/{y}/{x} order below is
        ArcGIS's, not the usual XYZ {z}/{x}/{y}.
      */}
      <TileLayer
        attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &middot; Boundaries: Census of India 2011'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
        className="basemap-tint"
      />

      <ZoomControl position="topright" />

      <FitTarget bounds={feature.properties.bounds} zone={activeZone} />

      {/*
        Static Census-2011 district boundary, shaded as a choropleth by risk level.
        Remounting on district + style change is the cheapest way to re-render a
        react-leaflet GeoJSON layer with new path options.
      */}
      <GeoJSON
        key={`glow-${districtId}-${riskLevel}`}
        data={feature}
        style={glowStyle}
        interactive={false}
      />
      <GeoJSON
        key={`${districtId}-${riskLevel}-${style.fillOpacity}`}
        data={feature}
        style={style}
      >
        <Tooltip sticky className="district-tooltip">
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-xl">
            <p className="text-sm font-semibold">
              {profile.name} District
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                #{feature.properties.dt_code}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {profile.area.toLocaleString("en-IN")} km&sup2; &middot;{" "}
              {(profile.population / 1e6).toFixed(2)} M residents
            </p>
            {result ? (
              <dl className="mt-2 space-y-0.5 text-xs">
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">Conversion</dt>
                  <dd className="font-mono font-medium">
                    {result.agri_to_commercial_pct}%
                  </dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">Flood risk</dt>
                  <dd className="font-mono font-medium">
                    +{result.predicted_flood_risk_increase_pct}%
                  </dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-muted-foreground">Risk level</dt>
                  <dd className="flex items-center gap-1.5 font-semibold">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {result.risk_level}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Move the conversion slider to simulate.
              </p>
            )}
          </div>
        </Tooltip>
      </GeoJSON>

      {/* The selected zone's footprint carries the risk shading at this scale */}
      {activeZone && (
        <Circle
          center={activeZone.center}
          radius={activeZone.radiusM}
          pathOptions={{
            color,
            weight: 2,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: 0.16 + intensity * 0.4,
          }}
          interactive={false}
        />
      )}

      {/*
        Zone pickers. Rendered above the choropleth so they stay clickable, and
        as CircleMarkers rather than Markers so they need no icon asset and
        scale independently of zoom.
      */}
      {zones.map((z) => {
        const selected = z.id === selectedZoneId;
        return (
          <CircleMarker
            key={z.id}
            center={z.center}
            radius={selected ? 10 : 7}
            pathOptions={{
              color: selected ? color : "#ffffff",
              weight: selected ? 3 : 2,
              opacity: selected ? 1 : 0.85,
              fillColor: selected ? color : "#0b1220",
              fillOpacity: selected ? 0.9 : 0.65,
            }}
            eventHandlers={{
              // Clicking the active zone again releases scope back to the district
              click: () => onSelectZone(selected ? null : z.id),
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} className="district-tooltip">
              <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-card-foreground shadow-xl">
                <p className="text-xs font-semibold">{z.name}</p>
                <p className="mt-0.5 max-w-[13rem] text-[11px] leading-snug text-muted-foreground">
                  {z.character}
                </p>
                <p className="mt-1 text-[10px] text-primary">
                  {selected ? "Click to clear zone" : "Click to scope simulation"}
                </p>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      <Pane name="labels" style={{ zIndex: 650, pointerEvents: "none" }}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          maxZoom={16}
        />
      </Pane>

      {/* ---- Map chrome: scope badge, legend ---- */}
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur-md">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Study area
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-tight">
          {activeZone ? activeZone.name : `${profile.name} District`}
        </p>
        {selectedZoneId && (
          <p className="text-[10px] text-muted-foreground">
            in {profile.name} District
          </p>
        )}
        <p className="font-mono text-[10px] text-muted-foreground">
          {feature.properties.center[0].toFixed(3)}&deg;N{" "}
          {feature.properties.center[1].toFixed(3)}&deg;E
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-card/85 px-3 py-2 backdrop-blur-md">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Composite risk band
        </p>
        <div className="mt-1.5 flex items-center gap-3">
          {RISK_LEVELS.map((level) => (
            <span key={level} className="flex items-center gap-1.5 text-xs">
              <span
                className="h-2.5 w-2.5 rounded-sm ring-1 ring-inset ring-white/15"
                style={{ backgroundColor: riskColor(level) }}
              />
              <span
                className={
                  level === riskLevel
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }
              >
                {level}
              </span>
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Shading deepens with conversion intensity
        </p>
      </div>
    </MapContainer>
  );
}
