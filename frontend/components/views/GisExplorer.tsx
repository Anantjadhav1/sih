"use client";

import { useCallback, useEffect, useState } from "react";
import { Layers3, Satellite, SatelliteDish } from "lucide-react";
import { useExplorerMap } from "@/components/maps/loaders";
import { GIS_LAYERS, layerColor } from "@/lib/gisLayers";
import { DEFAULT_DISTRICT_ID, getProfile } from "@/lib/districts";
import { probeBhuvan } from "@/lib/bhuvan";
import type { BhuvanStatus } from "@/lib/bhuvan";
import { cn } from "@/lib/utils";

export default function GisExplorer() {
  const ExplorerMap = useExplorerMap();
  const [districtId] = useState(DEFAULT_DISTRICT_ID);
  // Open on one layer so the map is never a blank basemap
  const [activeIds, setActiveIds] = useState<string[]>(["lulc"]);

  /*
   * Bhuvan availability is decided once, on mount, by asking for a single tile.
   * Until that answers we stay on the mock layer, so the map is never empty
   * while we wait - "probing" is a label, not a blank state.
   */
  const [bhuvanStatus, setBhuvanStatus] = useState<BhuvanStatus>("probing");

  useEffect(() => {
    let alive = true;
    probeBhuvan(districtId).then((ok) => {
      if (!alive) return;
      if (!ok) {
        console.log(
          "Bhuvan WMS unreachable, using fallback layer"
        );
      }
      setBhuvanStatus(ok ? "live" : "fallback");
    });
    return () => {
      alive = false;
    };
  }, [districtId]);

  /** Live tiles started failing after the probe passed - degrade quietly. */
  const handleBhuvanFailure = useCallback(() => {
    setBhuvanStatus((prev) => {
      if (prev !== "live") return prev;
      console.log("Bhuvan WMS unreachable, using fallback layer");
      return "fallback";
    });
  }, []);

  const profile = getProfile(districtId);

  function toggle(id: string) {
    setActiveIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-border bg-surface-1 p-4 lg:w-[19rem] lg:border-r">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Layers3 className="h-3 w-3" />
            Thematic layers
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Browse the evidence base over {profile.name} district. This view is
            read-only - policy levers live in the Simulator.
          </p>
        </div>

        {/*
          Source transparency: say plainly whether the LULC layer is coming from
          ISRO right now or from the bundled sample. Both are legitimate states.
        */}
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2",
            bhuvanStatus === "live"
              ? "border-primary/40 bg-primary/10"
              : "border-border bg-surface-2/50"
          )}
        >
          {bhuvanStatus === "live" ? (
            <SatelliteDish className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <Satellite className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "text-[11px] font-semibold",
                bhuvanStatus === "live" ? "text-primary" : "text-foreground"
              )}
            >
              {bhuvanStatus === "probing"
                ? "Contacting ISRO Bhuvan…"
                : bhuvanStatus === "live"
                  ? "Live Bhuvan Data"
                  : "Simulated Data"}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {bhuvanStatus === "probing"
                ? "Checking whether the WMS service is reachable."
                : bhuvanStatus === "live"
                  ? "Land Use / Land Cover streaming from Bhuvan WMS (NRSC)."
                  : "Bhuvan WMS unreachable - showing the bundled sample layer."}
            </p>
          </div>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="sr-only">Toggle thematic layers</legend>
          {GIS_LAYERS.map((layer) => {
            const on = activeIds.includes(layer.id);
            return (
              <label
                key={layer.id}
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors",
                  on
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-surface-2/50 hover:border-border hover:bg-accent/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(layer.id)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[hsl(var(--primary))]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    {/* Swatch echoes the map; the name carries the identity */}
                    {layer.encoding === "sequential" ? (
                      <span className="flex h-2.5 w-7 shrink-0 overflow-hidden rounded-sm">
                        {[0, 0.33, 0.66, 1].map((w) => (
                          <span
                            key={w}
                            className="h-full flex-1"
                            style={{
                              backgroundColor: layerColor(layer, { weight: w } as never),
                            }}
                          />
                        ))}
                      </span>
                    ) : (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-white/15"
                        style={{ backgroundColor: layer.color }}
                      />
                    )}
                    <span className="text-xs font-medium">{layer.name}</span>
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                    {layer.description}
                  </span>
                  <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                    {layer.source}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <p className="mt-auto border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground">
          {bhuvanStatus === "live"
            ? "Land Use / Land Cover is live from ISRO Bhuvan. The other three layers are mocked geometry; each accepts a WMS source in the same slot."
            : "Layer geometry is mocked for the demo. Each layer accepts an ISRO Bhuvan WMS source in its place - the renderer prefers a real service whenever one is reachable."}
        </p>
      </aside>

      <div className="relative min-h-[24rem] flex-1 lg:min-h-0">
        {ExplorerMap ? (
          <ExplorerMap
            districtId={districtId}
            activeLayerIds={activeIds}
            bhuvanStatus={bhuvanStatus}
            onBhuvanFailure={handleBhuvanFailure}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-1 text-xs text-muted-foreground">
            Loading basemap&hellip;
          </div>
        )}
      </div>
    </div>
  );
}
