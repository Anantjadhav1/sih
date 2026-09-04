"use client";

import { useEffect, useRef, useState } from "react";
import type { CurvePoint } from "@/lib/api";
import { RISK_COLORS, riskColor } from "@/lib/districts";

interface RiskCurveProps {
  curve: CurvePoint[];
  /** Conversion % currently set on the slider - marked on the curve. */
  current: number;
  districtName: string;
  /**
   * Upper bound of the active lever's slider. Levers do not share a range -
   * wetland encroachment stops at 40% - so the x-axis has to follow the
   * lever rather than assuming 0-100, or the area path closes across empty
   * space and draws a phantom descent to the right of the real data.
   */
  maxPct?: number;
}

const PAD = { top: 14, right: 10, bottom: 22, left: 30 };
const HEIGHT = 168;
/** Band thresholds, mirroring the backend's score_for() cut-offs. */
const THRESHOLDS = [
  { at: 20, label: "Moderate" },
  { at: 50, label: "High" },
];

export default function RiskCurve({
  curve,
  current,
  districtName,
  maxPct = 100,
}: RiskCurveProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<CurvePoint | null>(null);

  // Render against real pixel dimensions so strokes stay 1:1 and nothing
  // distorts - a scaled viewBox would smear the hairlines.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const w = width;
  const h = HEIGHT;
  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = h - PAD.top - PAD.bottom;

  const x = (pct: number) => PAD.left + (pct / maxPct) * plotW;
  const y = (score: number) => PAD.top + (1 - score / 100) * plotH;

  const active =
    hover ??
    curve.reduce((best, p) =>
      Math.abs(p.pct - current) < Math.abs(best.pct - current) ? p : best
    , curve[0]);

  if (!w || curve.length === 0) {
    return <div ref={wrapRef} style={{ height: h }} className="w-full" />;
  }

  const line = curve.map((p, i) => `${i ? "L" : "M"}${x(p.pct)},${y(p.risk_score)}`).join(" ");
  const area = `${line} L${x(maxPct)},${y(0)} L${x(0)},${y(0)} Z`;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={`Composite risk score for ${districtName} across conversion from 0 to ${maxPct} percent. At ${active.pct} percent the score is ${active.risk_score} out of 100, rated ${active.risk_level}.`}
        className="overflow-visible"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const pct = ((px - PAD.left) / plotW) * maxPct;
          const snapped = curve.reduce((best, p) =>
            Math.abs(p.pct - pct) < Math.abs(best.pct - pct) ? p : best
          , curve[0]);
          setHover(snapped);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {/*
            Vertical ramp anchored to the score scale, so a given height on the
            chart is always the same severity colour as the map choropleth.
          */}
          <linearGradient
            id="risk-area"
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={y(100)}
            x2={0}
            y2={y(0)}
          >
            <stop offset="0" stopColor={RISK_COLORS.High} stopOpacity="0.42" />
            <stop offset="0.5" stopColor={RISK_COLORS.Moderate} stopOpacity="0.32" />
            <stop offset="0.8" stopColor={RISK_COLORS.Low} stopOpacity="0.26" />
            <stop offset="1" stopColor={RISK_COLORS.Low} stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* Recessive grid: only the two band thresholds and the baseline */}
        {THRESHOLDS.map((t) => (
          <g key={t.at}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={y(t.at)}
              y2={y(t.at)}
              className="stroke-grid"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={w - PAD.right}
              y={y(t.at) - 4}
              textAnchor="end"
              className="fill-muted-foreground text-[9px] uppercase tracking-wider"
            >
              {t.label}
            </text>
          </g>
        ))}

        <line
          x1={PAD.left}
          x2={w - PAD.right}
          y1={y(0)}
          y2={y(0)}
          className="stroke-axis"
          strokeWidth={1}
        />

        <path d={area} fill="url(#risk-area)" />
        <path
          d={line}
          fill="none"
          className="stroke-foreground/80"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Y ticks */}
        {[0, 50, 100].map((v) => (
          <text
            key={v}
            x={PAD.left - 7}
            y={y(v) + 3}
            textAnchor="end"
            className="fill-muted-foreground font-mono text-[9px]"
          >
            {v}
          </text>
        ))}

        {/* X ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxPct * f)).map((v) => (
          <text
            key={v}
            x={x(v)}
            y={h - 6}
            textAnchor={v === 0 ? "start" : v === maxPct ? "end" : "middle"}
            className="fill-muted-foreground font-mono text-[9px]"
          >
            {v}%
          </text>
        ))}

        {/* Crosshair for the hovered point */}
        {hover && (
          <line
            x1={x(hover.pct)}
            x2={x(hover.pct)}
            y1={PAD.top}
            y2={y(0)}
            className="stroke-foreground/35"
            strokeWidth={1}
          />
        )}

        {/* Current scenario marker: >=8px, ringed against the surface */}
        <circle
          cx={x(active.pct)}
          cy={y(active.risk_score)}
          r={5}
          fill={riskColor(active.risk_level)}
          className="stroke-card"
          strokeWidth={2}
        />
      </svg>

      {/* Tooltip - text stays in ink tokens; the dot carries the status colour */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-xl"
          style={{
            left: Math.min(Math.max(x(hover.pct), 54), w - 54),
            top: Math.max(y(hover.risk_score) - 52, 0),
          }}
        >
          <p className="font-mono text-[11px] text-muted-foreground">
            {hover.pct}% converted
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: riskColor(hover.risk_level) }}
            />
            <span className="font-mono">{hover.risk_score}</span>
            <span className="font-normal text-muted-foreground">{hover.risk_level}</span>
          </p>
        </div>
      )}
    </div>
  );
}
