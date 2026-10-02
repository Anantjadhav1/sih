"use client";

import { useEffect, useState } from "react";
import { ExternalLink, History, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BhuvanStatus } from "@/lib/bhuvan";
import {
  OFFICIAL_LEGEND_URL,
  SURVEY_REGION_LABEL,
  TIME_MACHINE_YEARS,
  fetchLanduseChange,
} from "@/lib/timeMachine";
import type { LanduseChange, SurveyYear } from "@/lib/timeMachine";
import { cn } from "@/lib/utils";

/** How long each year stays on screen while playing. */
const PLAY_STEP_MS = 1600;

/**
 * Time machine card for the GIS Explorer: flip between ISRO's 2005 and 2015
 * land-use surveys of north-west Pune, and see how much was built over.
 */
export default function TimeMachinePanel({
  bhuvanStatus,
  year,
  onYearChange,
}: {
  bhuvanStatus: BhuvanStatus;
  /** null = time machine off */
  year: SurveyYear | null;
  onYearChange: (year: SurveyYear | null) => void;
}) {
  const [change, setChange] = useState<LanduseChange | null>(null);
  const [playing, setPlaying] = useState(false);

  // The measurement runs once on the server; poll until it's ready
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      fetchLanduseChange()
        .then((c) => {
          if (!alive) return;
          setChange(c);
          if (c.computing) timer = setTimeout(load, 10_000);
        })
        .catch(() => alive && setChange({ available: false, reason: "The server is unreachable." }));
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  // Play: flip between the two surveys until paused or switched off
  useEffect(() => {
    if (!playing || year === null) return;
    const id = setInterval(() => {
      onYearChange(year === TIME_MACHINE_YEARS[0] ? TIME_MACHINE_YEARS[1] : TIME_MACHINE_YEARS[0]);
    }, PLAY_STEP_MS);
    return () => clearInterval(id);
  }, [playing, year, onYearChange]);

  // Losing the live connection ends the time machine - there is nothing to show
  useEffect(() => {
    if (bhuvanStatus !== "live" && year !== null) {
      setPlaying(false);
      onYearChange(null);
    }
  }, [bhuvanStatus, year, onYearChange]);

  const live = bhuvanStatus === "live";
  const first = change?.years?.[0];
  const last = change?.years?.[change.years.length - 1];

  return (
    <section className="space-y-2.5 rounded-lg border border-border bg-surface-2/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <History className="h-3.5 w-3.5 text-primary" />
        Time machine
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Two real ISRO land-use surveys, ten years apart, of {SURVEY_REGION_LABEL}. Watch the
        red built-up area spread.
      </p>

      {!live ? (
        <p className="text-[11px] text-muted-foreground">
          {bhuvanStatus === "probing"
            ? "Checking the connection to ISRO Bhuvan…"
            : "Needs a live connection to ISRO Bhuvan, which is unreachable right now."}
        </p>
      ) : year === null ? (
        <Button
          size="sm"
          className="h-8 w-full text-[11px]"
          onClick={() => onYearChange(TIME_MACHINE_YEARS[0])}
        >
          Show on map
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
            {TIME_MACHINE_YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  onYearChange(y);
                }}
                aria-pressed={y === year}
                className={cn(
                  "rounded-md border px-2 py-1.5 font-mono text-xs font-semibold transition-colors",
                  y === year
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-surface-2/50 text-muted-foreground hover:text-foreground"
                )}
              >
                {y}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
              className="grid w-9 place-items-center rounded-md border border-border bg-surface-2/50 text-muted-foreground hover:text-foreground"
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              onYearChange(null);
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            &larr; Back to the layers
          </button>
        </div>
      )}

      {/* The measured change - the number worth quoting */}
      {change?.available && first && last && change.change ? (
        <div className="rounded-md border border-border bg-background/40 px-3 py-2">
          <p className="text-sm font-semibold">
            +{change.change.km2} km&sup2; built over
            <span className="font-normal text-muted-foreground">
              {" "}
              in {last.year - first.year} years
            </span>
          </p>
          <dl className="mt-1 space-y-0.5 text-[11px]">
            {[first, last].map((y) => (
              <div key={y.year} className="flex justify-between gap-2">
                <dt className="font-mono text-muted-foreground">{y.year}</dt>
                <dd>
                  <span className="font-mono">{y.built_up_pct}%</span> built-up{" "}
                  <span className="text-muted-foreground">({y.built_up_km2} km&sup2;)</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Measured by counting built-up pixels in the two survey maps, using
            Bhuvan&rsquo;s own legend colours.
          </p>
        </div>
      ) : change?.computing ? (
        <p className="text-[11px] text-muted-foreground">
          Measuring the change from the survey maps - ready in about a minute.
        </p>
      ) : change && !change.available ? (
        <p className="text-[11px] text-muted-foreground">{change.reason}</p>
      ) : null}

      <a
        href={OFFICIAL_LEGEND_URL}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        Bhuvan&rsquo;s full legend <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </section>
  );
}
