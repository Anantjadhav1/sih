"use client";

import { useEffect, useRef, useState } from "react";

export interface TrendSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
}

const PAD = { top: 12, right: 12, bottom: 22, left: 30 };
const HEIGHT = 170;

/**
 * Multi-series line chart for change over time.
 *
 * Series colours come from the validated categorical palette in fixed slot
 * order and are never cycled; a legend is always present because there is more
 * than one series, so identity never rests on colour alone.
 */
export default function TrendChart({
  series,
  xLabels,
  unit = "%",
}: {
  series: TrendSeries[];
  xLabels: string[];
  unit?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const w = width;
  const h = HEIGHT;
  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = h - PAD.top - PAD.bottom;

  const n = xLabels.length;
  const all = series.flatMap((s) => s.values);
  const maxV = Math.ceil(Math.max(...all, 0) / 10) * 10 || 10;

  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - v / maxV) * plotH;

  if (!w) return <div ref={wrapRef} style={{ height: h }} className="w-full" />;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={`Land use trend, ${series
          .map((s) => `${s.label} from ${s.values[0]}${unit} to ${s.values[n - 1]}${unit}`)
          .join("; ")}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientX - r.left - PAD.left) / plotW;
          setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
        }}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Recessive gridlines */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={w - PAD.right}
            y1={PAD.top + f * plotH}
            y2={PAD.top + f * plotH}
            className="stroke-grid"
            strokeWidth={1}
          />
        ))}

        {[0, maxV / 2, maxV].map((v) => (
          <text
            key={v}
            x={PAD.left - 6}
            y={y(v) + 3}
            textAnchor="end"
            className="fill-muted-foreground font-mono text-[9px]"
          >
            {v}
          </text>
        ))}

        {xLabels.map((lbl, i) => (
          <text
            key={lbl}
            x={x(i)}
            y={h - 6}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            className="fill-muted-foreground font-mono text-[9px]"
          >
            {lbl}
          </text>
        ))}

        {hoverIdx !== null && (
          <line
            x1={x(hoverIdx)}
            x2={x(hoverIdx)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            className="stroke-foreground/30"
            strokeWidth={1}
          />
        )}

        {series.map((s) => (
          <path
            key={s.id}
            d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Markers only on the hovered column, not on every point */}
        {hoverIdx !== null &&
          series.map((s) => (
            <circle
              key={s.id}
              cx={x(hoverIdx)}
              cy={y(s.values[hoverIdx])}
              r={4}
              fill={s.color}
              className="stroke-card"
              strokeWidth={2}
            />
          ))}
      </svg>

      {hoverIdx !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-xl"
          style={{ left: Math.min(Math.max(x(hoverIdx), 60), w - 60), top: 0 }}
        >
          <p className="font-mono text-[10px] text-muted-foreground">
            {xLabels[hoverIdx]}
          </p>
          {series.map((s) => (
            <p key={s.id} className="mt-0.5 flex items-center gap-1.5 text-[11px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-mono font-medium">
                {s.values[hoverIdx]}
                {unit}
              </span>
            </p>
          ))}
        </div>
      )}

      {/* Legend is mandatory at two or more series */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
