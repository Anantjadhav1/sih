"use client";

export interface Bar {
  label: string;
  value: number;
  /** Optional per-bar colour; single-series charts leave this unset */
  color?: string;
  note?: string;
}

/**
 * Horizontal bars for comparing a single measure across a handful of named
 * categories.
 *
 * Horizontal rather than vertical because the categories are place names -
 * they read straight without rotated tick labels. One series, so no legend:
 * the surrounding heading names the measure. Values are direct-labelled at the
 * end of each bar, which removes the need for an axis entirely.
 */
export default function BarChart({
  bars,
  unit = "",
  barColor = "hsl(var(--primary))",
}: {
  bars: Bar[];
  unit?: string;
  barColor?: string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <ul className="space-y-2">
      {bars.map((b) => (
        <li key={b.label}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[11px]">{b.label}</span>
            <span className="shrink-0 font-mono text-[11px] font-medium">
              {b.value.toLocaleString("en-IN")}
              {unit}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            {/* 4px rounded data-end anchored to the baseline */}
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${(b.value / max) * 100}%`,
                backgroundColor: b.color ?? barColor,
              }}
            />
          </div>
          {b.note && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">{b.note}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
