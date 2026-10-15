"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

/**
 * The chart kit behind the admin Stats tab — inline SVG, no library.
 *
 * Colours are the validated dark-mode steps, checked against the admin card
 * surface (#14101c, white at 4% over the page) for lightness band, chroma,
 * colour-blind separation and contrast. Three categorical slots pass every
 * check there; nothing here uses a fourth. Text never wears a series colour —
 * identity comes from the swatch or line key beside it.
 */
export const VIZ = {
  s1: "#3987e5",
  s2: "#d95926",
  s3: "#199e70",
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
  grid: "rgba(255,255,255,0.07)",
  axis: "rgba(255,255,255,0.16)",
  muted: "rgba(255,255,255,0.45)",
  surface: "#14101c",
  /** Sequential blue, low → high, for the heatmap. Low recedes into the
   * dark surface; high is the lightest step. */
  seq: ["#16213a", "#104281", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"]
} as const;

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export const compact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}K`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};

export const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

/** Clean axis steps: 1, 2, 5 × 10^n, never more than ~5 ticks. */
export const niceTicks = (max: number, count = 4) => {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
};

/** The width of an element, kept current as it resizes. */
export const useWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width))
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

const cardClass =
  "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur";

/**
 * A chart in a card, with the table view one click away — every value a
 * chart shows is reachable without hovering.
 */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  aside
}: {
  title: string;
  subtitle?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={clsx(cardClass, "p-5")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white/90">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-white/45">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {aside}
          {table && (
            <div className="flex rounded-lg bg-white/5 p-0.5 text-[11px]">
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={clsx(
                    "rounded-md px-2.5 py-1 capitalize transition",
                    view === v ? "bg-white/15 text-white" : "text-white/45 hover:text-white/80"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {view === "chart" || !table ? children : table}
    </section>
  );
}

export function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">{title}</h2>
        {note && <p className="text-[11px] text-white/35">{note}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/40">
      {children}
    </p>
  );
}

/** A plain table — the accessible twin of every chart. */
export function DataTable({
  columns,
  rows,
  maxHeight = 360
}: {
  columns: { label: string; align?: "left" | "right" }[];
  rows: ReactNode[][];
  maxHeight?: number;
}) {
  if (!rows.length) return <Empty>Nothing in this range.</Empty>;
  return (
    <div className="overflow-auto rounded-xl border border-white/10" style={{ maxHeight }}>
      <table className="w-full min-w-max text-xs">
        <thead className="sticky top-0 bg-[#1a1524]">
          <tr>
            {columns.map((c) => (
              <th
                key={c.label}
                className={clsx(
                  "whitespace-nowrap px-3 py-2 font-medium text-white/50",
                  c.align === "right" ? "text-right" : "text-left"
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={clsx(
                    "whitespace-nowrap px-3 py-2 text-white/80",
                    columns[j]?.align === "right" ? "text-right" : "text-left"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

/**
 * label · value · optional delta vs a named period. The delta carries an
 * arrow and words, never colour alone.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaGoodWhenUp = true,
  sub,
  hero
}: {
  label: string;
  value: ReactNode;
  delta?: { value: number; vs: string } | null;
  deltaGoodWhenUp?: boolean;
  sub?: ReactNode;
  hero?: boolean;
}) {
  const up = delta && delta.value > 0;
  const down = delta && delta.value < 0;
  const good = (up && deltaGoodWhenUp) || (down && !deltaGoodWhenUp);
  return (
    <div className={clsx(cardClass, hero ? "px-6 py-5" : "px-4 py-3.5")}>
      <p className="text-[11px] text-white/50">{label}</p>
      <p
        className={clsx(
          "mt-1 font-semibold text-white",
          hero ? "text-5xl tracking-tight" : "text-2xl"
        )}
      >
        {value}
      </p>
      {delta && (
        <p
          className={clsx(
            "mt-1 text-[11px]",
            delta.value === 0 ? "text-white/40" : good ? "text-emerald-400" : "text-rose-300"
          )}
        >
          {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "•"}{" "}
          {delta.value > 0 ? "+" : ""}
          {delta.value.toLocaleString()} vs {delta.vs}
        </p>
      )}
      {sub && <p className="mt-1 text-[11px] text-white/40">{sub}</p>}
    </div>
  );
}

/** A status chip: icon + word + colour, so the colour never stands alone. */
export function Status({ kind, children }: { kind: "good" | "warning" | "critical"; children: ReactNode }) {
  const icon = kind === "good" ? "✓" : kind === "warning" ? "!" : "✕";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-white/80">
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-black"
        style={{ background: VIZ[kind] }}
        aria-hidden
      >
        {icon}
      </span>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

type Tip = { x: number; y: number; title: string; rows: { label: string; value: string; color?: string; line?: boolean }[] };

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x + 12, 4), Math.max(4, width - 184));
  return (
    <div
      className="pointer-events-none absolute z-10 w-44 rounded-lg border border-white/10 bg-[#1f1a2b]/95 px-3 py-2 shadow-xl"
      style={{ left, top: Math.max(0, tip.y - 8) }}
      role="status"
    >
      <p className="text-[11px] text-white/50">{tip.title}</p>
      {tip.rows.map((row) => (
        <div key={row.label} className="mt-1 flex items-center gap-2">
          {row.color && (
            <span
              className={row.line ? "h-0.5 w-3 rounded-full" : "h-2 w-2 rounded-sm"}
              style={{ background: row.color }}
              aria-hidden
            />
          )}
          <span className="text-sm font-semibold text-white">{row.value}</span>
          <span className="truncate text-[11px] text-white/50">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Columns — counts per day, with an optional average line             */
/* ------------------------------------------------------------------ */

export type ColumnPoint = { key: string; label: string; value: number; avg?: number };

export function ColumnChart({
  points,
  valueLabel,
  avgLabel,
  height = 190
}: {
  points: ColumnPoint[];
  valueLabel: string;
  avgLabel?: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 32, r: 8, t: 8, b: 22 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = height - pad.t - pad.b;
  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.avg ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const band = points.length ? plotW / points.length : 0;
  const gap = band >= 6 ? 2 : 0;
  const barW = Math.max(1, Math.min(24, band - gap));
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotW / 64))));

  const avgPath = points.some((p) => p.avg !== undefined)
    ? points
        .map((p, i) => `${i ? "L" : "M"}${pad.l + band * i + band / 2},${y(p.avg ?? 0)}`)
        .join(" ")
    : "";

  const tip: Tip | null =
    hover === null || !points[hover]
      ? null
      : {
          x: pad.l + band * hover + band / 2,
          y: pad.t,
          title: points[hover].label,
          rows: [
            { label: valueLabel, value: points[hover].value.toLocaleString(), color: VIZ.s1 },
            ...(points[hover].avg !== undefined && avgLabel
              ? [{ label: avgLabel, value: (points[hover].avg as number).toFixed(1), color: VIZ.s2, line: true }]
              : [])
          ]
        };

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${valueLabel} per day`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={VIZ.muted} className="tabular-nums">
                {compact(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const h = Math.max(0, (p.value / top) * plotH);
            const x = pad.l + band * i + (band - barW) / 2;
            const r = Math.min(4, barW / 2, h);
            const yTop = pad.t + plotH - h;
            return (
              <g key={p.key}>
                {h > 0 && (
                  <path
                    d={`M${x},${pad.t + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${pad.t + plotH} Z`}
                    fill={VIZ.s1}
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={pad.l + band * i + band / 2} y={height - 6} textAnchor="middle" fontSize={10} fill={VIZ.muted}>
                    {p.key.slice(5).replace("-", "/")}
                  </text>
                )}
                {/* Hit area: the whole band, not just the painted bar. */}
                <rect
                  x={pad.l + band * i}
                  y={pad.t}
                  width={Math.max(band, 1)}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${p.label}: ${p.value} ${valueLabel}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
          {avgPath && (
            <path d={avgPath} fill="none" stroke={VIZ.s2} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
          )}
        </svg>
      )}
      {avgLabel && (
        <div className="mt-2 flex gap-4 text-[11px] text-white/55">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: VIZ.s1 }} /> {valueLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: VIZ.s2 }} /> {avgLabel}
          </span>
        </div>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lines — values over time, one shared axis                           */
/* ------------------------------------------------------------------ */

export type LineSeries = {
  name: string;
  color: string;
  points: { t: number; v: number }[];
  /** A forecast, drawn dashed so it reads as "not yet real". */
  projected?: boolean;
};

export function LineChart({
  series,
  height = 190,
  format = (v: number) => v.toLocaleString(),
  zeroBased = true
}: {
  series: LineSeries[];
  height?: number;
  format?: (v: number) => string;
  zeroBased?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);
  const pad = { l: 40, r: 12, t: 10, b: 22 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = height - pad.t - pad.b;

  const all = series.flatMap((s) => s.points);
  const ts = all.map((p) => p.t);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const vs = all.map((p) => p.v);
  const vMin = zeroBased ? 0 : Math.min(...vs);
  const ticks = zeroBased
    ? niceTicks(Math.max(1, ...vs))
    : (() => {
        const span = Math.max(1, Math.max(...vs) - vMin);
        const step = niceTicks(span, 3)[1] || 1;
        const lo = Math.floor(vMin / step) * step;
        const out = [];
        for (let v = lo; v <= Math.max(...vs) + step; v += step) out.push(v);
        return out;
      })();
  const yLo = ticks[0];
  const yHi = ticks[ticks.length - 1];
  const x = (t: number) => pad.l + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => pad.t + plotH - ((v - yLo) / Math.max(1e-9, yHi - yLo)) * plotH;

  const allTs = useMemo(() => [...new Set(ts)].sort((a, b) => a - b), [ts]);
  const valueAt = (s: LineSeries, t: number) => s.points.find((p) => p.t === t)?.v;

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = event.clientX - rect.left;
    const target = t0 + (px / Math.max(1, plotW)) * (t1 - t0);
    let best = allTs[0];
    for (const t of allTs) if (Math.abs(t - target) < Math.abs(best - target)) best = t;
    setHoverT(best);
  };

  const tip: Tip | null =
    hoverT === null
      ? null
      : {
          x: x(hoverT),
          y: pad.t,
          title: new Date(hoverT).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          rows: series
            .map((s) => ({ s, v: valueAt(s, hoverT) }))
            .filter((r) => r.v !== undefined)
            .map(({ s, v }) => ({ label: s.name, value: format(v as number), color: s.color, line: true }))
        };

  const xTickCount = Math.max(2, Math.min(6, Math.floor(plotW / 90)));
  const xTicks = Array.from({ length: xTickCount }, (_, i) => t0 + ((t1 - t0) * i) / (xTickCount - 1));

  return (
    <div ref={ref} className="relative">
      {width > 0 && all.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.name).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === yLo ? VIZ.axis : VIZ.grid} />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={VIZ.muted}>
                {compact(t)}
              </text>
            </g>
          ))}
          {t1 > t0 &&
            xTicks.map((t) => (
              <text key={t} x={x(t)} y={height - 6} textAnchor="middle" fontSize={10} fill={VIZ.muted}>
                {new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </text>
            ))}
          {series.map((s) => (
            <path
              key={s.name}
              d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.v)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.projected ? "5 5" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {/* End markers, ringed in the surface colour. */}
          {series.map((s) => {
            const last = s.points[s.points.length - 1];
            return last ? (
              <circle key={s.name} cx={x(last.t)} cy={y(last.v)} r={4} fill={s.color} stroke={VIZ.surface} strokeWidth={2} />
            ) : null;
          })}
          {hoverT !== null && (
            <line x1={x(hoverT)} x2={x(hoverT)} y1={pad.t} y2={pad.t + plotH} stroke={VIZ.axis} />
          )}
          <rect
            x={pad.l}
            y={pad.t}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHoverT(null)}
          />
        </svg>
      )}
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-white/55">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-3 rounded-full"
                style={{
                  background: s.projected
                    ? `repeating-linear-gradient(90deg, ${s.color} 0 3px, transparent 3px 5px)`
                    : s.color
                }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bars — ranked lists                                      */
/* ------------------------------------------------------------------ */

export type BarRow = { key: string; label: ReactNode; value: number; note?: ReactNode; title?: string };

export function HBars({
  rows,
  format = (v: number) => v.toLocaleString(),
  color = VIZ.s1
}: {
  rows: BarRow[];
  format?: (v: number) => string;
  color?: string;
}) {
  if (!rows.length) return <Empty>Nothing in this range.</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.key} className="group" title={row.title}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-white/80">{row.label}</span>
            <span className="shrink-0 tabular-nums text-white/60">
              {format(row.value)}
              {row.note && <span className="ml-1.5 text-white/35">{row.note}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/[0.04]">
            <div
              className="h-2 rounded-full transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max(1.5, (row.value / max) * 100)}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Funnel — ordered steps, one hue, conversion between them            */
/* ------------------------------------------------------------------ */

export function Funnel({ steps }: { steps: { label: string; value: number; hint?: string }[] }) {
  const first = steps[0]?.value || 0;
  if (!first) return <Empty>No visits logged in this range yet.</Empty>;
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => {
        const prev = i ? steps[i - 1].value : step.value;
        return (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-white/80">
                {step.label}
                {step.hint && <span className="ml-1.5 text-white/35">{step.hint}</span>}
              </span>
              <span className="tabular-nums text-white/70">
                <span className="font-semibold text-white">{step.value.toLocaleString()}</span>
                <span className="ml-2 text-white/40">{pct(step.value, first)} of visitors</span>
                {i > 0 && <span className="ml-2 text-white/40">· {pct(step.value, prev)} of previous</span>}
              </span>
            </div>
            <div className="mt-1 h-3 rounded-md bg-white/[0.04]">
              <div
                className="h-3 rounded-md"
                style={{ width: `${Math.max(1, (step.value / first) * 100)}%`, background: VIZ.s1 }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap — day of week × hour                                        */
/* ------------------------------------------------------------------ */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Heatmap({ grid }: { grid: number[][] }) {
  const [tip, setTip] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const colorFor = (v: number) =>
    v === 0 ? "rgba(255,255,255,0.03)" : VIZ.seq[Math.min(VIZ.seq.length - 1, Math.ceil((v / max) * (VIZ.seq.length - 1)))];
  const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] gap-[2px]" style={{ gridTemplateColumns: "36px repeat(24, minmax(0, 1fr))" }}>
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[9px] text-white/35">
              {h % 3 === 0 ? hourLabel(h) : ""}
            </span>
          ))}
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <span className="pr-1 text-right text-[10px] leading-5 text-white/45">{DAYS[d]}</span>
              {row.map((v, h) => (
                <button
                  key={h}
                  type="button"
                  className={clsx("h-5 rounded-[3px] outline-none ring-white/60 focus:ring-1", tip?.d === d && tip?.h === h && "ring-1")}
                  style={{ background: colorFor(v) }}
                  aria-label={`${DAYS[d]} ${hourLabel(h)}: ${v} downloads`}
                  onPointerEnter={() => setTip({ d, h })}
                  onFocus={() => setTip({ d, h })}
                  onPointerLeave={() => setTip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-white/50">
        <span>
          {tip
            ? `${DAYS[tip.d]} ${hourLabel(tip.h)}–${hourLabel((tip.h + 1) % 24)}: ${grid[tip.d][tip.h]} download${grid[tip.d][tip.h] === 1 ? "" : "s"}`
            : "Hover a cell for the count. Your local time."}
        </span>
        <span className="flex items-center gap-1.5">
          0
          {VIZ.seq.map((c) => (
            <span key={c} className="h-2.5 w-4 rounded-sm" style={{ background: c }} />
          ))}
          {max}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, width = 88, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-white/25">—</span>;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",").map(Number);
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <polyline points={pts.join(" ")} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={VIZ.s1} />
    </svg>
  );
}
