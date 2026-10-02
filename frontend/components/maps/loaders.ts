"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { SimulationResult } from "@/lib/api";
import type { Zone } from "@/lib/zones";
import type { Observation } from "@/lib/groundTruth";
import type { SurveyYear } from "@/lib/timeMachine";

export interface PolicyMapProps {
  districtId: string;
  riskLevel: string;
  result: SimulationResult | null;
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
}

export interface ExplorerMapProps {
  districtId: string;
  activeLayerIds: string[];
  /** Whether live Bhuvan WMS tiles should be used for the LULC layer. */
  bhuvanStatus?: "probing" | "live" | "fallback";
  /** Called when live tiles start failing, so the view can drop to the mock. */
  onBhuvanFailure?: () => void;
  /** Citizen ground-truth photos to pin on the map */
  observations?: Observation[];
  showObservations?: boolean;
  /** While true, a map click picks the location for a new photo */
  pickMode?: boolean;
  draftLocation?: [number, number] | null;
  onPick?: (lat: number, lng: number) => void;
  /** Which ISRO survey year to show; null keeps the normal layer view */
  timeYear?: SurveyYear | null;
}

/*
 * Leaflet needs `window`, so its components load client-side only - but NOT via
 * next/dynamic. next/dynamic wraps the component in a Suspense boundary, and on
 * first load React hides then re-reveals that subtree (an Offscreen pass).
 * Offscreen preserves the DOM node while re-attaching refs, which walks
 * react-leaflet 4.2.1 into its "Map container is already initialized" bug and
 * takes the page down with it (see PolicyMap for the full detail).
 *
 * Importing by hand keeps the map a plain child with no Suspense boundary above
 * it, so it mounts exactly once.
 */
function useLazyComponent<P>(
  load: () => Promise<{ default: ComponentType<P> }>
): ComponentType<P> | null {
  const [Comp, setComp] = useState<ComponentType<P> | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (alive) setComp(() => m.default);
    });
    return () => {
      alive = false;
    };
    // `load` is a stable module import in every call site below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return Comp;
}

export const usePolicyMap = () =>
  useLazyComponent<PolicyMapProps>(() => import("@/components/PolicyMap"));

export const useExplorerMap = () =>
  useLazyComponent<ExplorerMapProps>(() => import("@/components/ExplorerMap"));
