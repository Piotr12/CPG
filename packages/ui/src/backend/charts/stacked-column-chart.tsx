import { TriangleAlertIcon } from "lucide-react";
import { EmptyState } from "../feedback/empty-state";

// A server-renderable stacked-column chart (demand review, #240). Marks are SVG; the x axis is in percentages
// of the plot's width, so the chart fills its card without measuring it, and each column is a nested <svg>
// placed at its bucket's centre, so its own geometry stays in pixels (at most 24 px wide, 4 px rounded top).
// Chart hues are series identity only: every text uses a text token (tests/design-tokens.test.ts).

export interface StackedColumnBucket {
  /** Stable React key (an ISO date, say). */
  key: string;
  /** Short axis label: "W44", "3 Nov", "Nov". */
  label: string;
  /** The column's tooltip heading; `label` when absent ("W44 · 27 Oct – 2 Nov"). */
  title?: string;
  /** The bucket ended before today. Past buckets are tinted. */
  past: boolean;
  /** The bucket contains today. It holds the Today rule. */
  current: boolean;
  /** Stacked values, bottom-up, one per `labels.series` entry (at most three; the third is hatched). */
  segments: number[];
  /** The line series' value in this bucket; no point when absent. */
  line?: number;
  /** A warning above the column ("2.5 overdue"), with `TriangleAlertIcon` in the warning token. */
  marker?: string;
}

/** Every text the chart shows, as plain strings, so a client component can pass them through. */
export interface StackedColumnChartLabels {
  /** The `aria-label` of the whole chart: what it shows, in one or two sentences. */
  summary: string;
  /** Series names, bottom-up, matching `segments`. */
  series: string[];
  /** The line series' name ("Ordered"), listed in each column's tooltip. */
  line?: string;
  /** Caption left of the Today rule: "Past · what shipped". */
  past: string;
  /** Caption right of the Today rule: "Today and ahead · what is still to ship". */
  ahead: string;
  /** Shown instead of the chart when the window holds nothing. */
  empty: string;
}

export interface StackedColumnChartProps {
  buckets: StackedColumnBucket[];
  /** Where today sits inside the current bucket, 0 (its start) to 1 (its end). */
  todayFraction: number;
  /** The unit every value is in, shown on the top tick and in the tooltips ("SU"). */
  unit: string;
  labels: StackedColumnChartLabels;
  /** Number formatting locale (`Intl.NumberFormat`); `en` when absent. */
  locale?: string;
  /** Makes the hatch pattern's id unique when a page shows more than one chart. */
  id?: string;
}

/** Complete class names per series (Tailwind only generates classes it finds whole in the source). */
export const SERIES_FILLS = ["fill-chart-1", "fill-chart-2", "fill-chart-3"] as const;
/** The series drawn hatched (zero-based): the third, so it reads without its hue. */
export const HATCHED = 2;
/** The line series (Ordered): foreground at 70%, 1.5 px, with 2.5 px dots in a surface ring. */
export const LINE = { opacity: 0.7, width: 1.5, dot: 2.5, ring: 1.5 } as const;

const TOP = 48; // captions, then room for a marker above the tallest column
const PLOT_HEIGHT = 200;
const BOTTOM = 24; // bucket labels
const HEIGHT = TOP + PLOT_HEIGHT + BOTTOM;
const BASELINE = TOP + PLOT_HEIGHT;
const GAP = 2;
const RADIUS = 4;
const MAX_COLUMN = 24;
const MIN_SLOT = 20;
const MIN_PLOT = 640;
const MAX_LABELS = 16;
/** A caption is drawn only when its side of the Today rule has this much of the plot. */
const CAPTION_ROOM = 0.2;

export interface Ticks {
  /** The step between ticks: 1, 2, 2.5 or 5 × 10ⁿ. */
  step: number;
  /** The top tick, the first multiple of `step` at or above the maximum. */
  top: number;
  /** 0, step, 2 × step, …, top. */
  values: number[];
}

/** "Nice" ticks from 0 to at least `max`, about `target` steps of 1, 2, 2.5 or 5 × 10ⁿ. */
export function niceTicks(max: number, target = 4): Ticks {
  if (!(max > 0)) return { step: 1, top: 1, values: [0, 1] };
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((multiple) => clean(multiple * magnitude)).find((candidate) => candidate >= raw * (1 - 1e-9))!;
  const count = Math.ceil(max / step - 1e-9);
  const values = Array.from({ length: count + 1 }, (_, index) => clean(index * step));
  return { step, top: values[count]!, values };
}

/** Removes floating-point noise (`0.30000000000000004` → `0.3`). */
function clean(value: number): number {
  return Number(value.toPrecision(12));
}

/** A column's width for `count` buckets: at most 24 px, about 70 % of the narrowest slot the plot allows. */
export function columnWidth(count: number): number {
  return Math.min(MAX_COLUMN, Math.floor(slotMinimum(count) * 0.7));
}

function slotMinimum(count: number): number {
  return Math.max(MIN_SLOT, MIN_PLOT / Math.max(count, 1));
}

/** A tooltip figure, per the reports' rule: up to 1 decimal under 100, none from 100 up, and zero as "–". */
export function formatFigure(value: number, locale: string): string {
  if (value === 0) return "–";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0 }).format(value);
}

/** A tick label, with as many decimals as the step needs (0.25 → 2). */
function formatTick(value: number, step: number, locale: string): string {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(value);
}

interface Segment {
  series: number;
  /** Heights above the baseline, in px. */
  bottom: number;
  top: number;
}

/** The bucket's drawn segments, bottom-up: zero values skipped, a 2 px gap under every segment but the first. */
export function stackSegments(values: number[], scale: number): Segment[] {
  const segments: Segment[] = [];
  let height = 0;
  values.slice(0, SERIES_FILLS.length).forEach((value, series) => {
    if (!(value > 0)) return;
    const bottom = height;
    height += value * scale;
    segments.push({ series, bottom: segments.length === 0 ? bottom : Math.min(bottom + GAP, height), top: height });
  });
  return segments;
}

/** A column segment's outline, centred on x = 0; the top one gets the 4 px rounded corners. */
function segmentPath({ bottom, top }: Segment, width: number, rounded: boolean): string {
  const left = -width / 2;
  const right = width / 2;
  const yBottom = BASELINE - bottom;
  const yTop = BASELINE - top;
  const radius = rounded ? Math.min(RADIUS, top - bottom, width / 2) : 0;
  if (radius === 0) return `M${left} ${yBottom}V${yTop}H${right}V${yBottom}Z`;
  return (
    `M${left} ${yBottom}V${yTop + radius}A${radius} ${radius} 0 0 1 ${left + radius} ${yTop}` +
    `H${right - radius}A${radius} ${radius} 0 0 1 ${right} ${yTop + radius}V${yBottom}Z`
  );
}

const percent = (value: number) => `${clean(value * 100)}%`;

/** Shipped and still-to-ship columns on one time axis, with a past tint, a Today rule and an optional line. */
export function StackedColumnChart({ buckets, todayFraction, unit, labels, locale = "en", id = "stacked-column-chart" }: StackedColumnChartProps) {
  const totals = buckets.map((bucket) => bucket.segments.slice(0, SERIES_FILLS.length).reduce((sum, value) => sum + Math.max(value, 0), 0));
  const max = Math.max(0, ...totals, ...buckets.map((bucket) => bucket.line ?? 0));
  if (max === 0) return <EmptyState title={labels.empty} />;

  const count = buckets.length;
  const ticks = niceTicks(max);
  const scale = PLOT_HEIGHT / ticks.top;
  const width = columnWidth(count);
  const centre = (index: number) => (index + 0.5) / count;
  const hatch = `${id}-hatch`;

  const tickLabels = ticks.values.map((value, index) => {
    const text = formatTick(value, ticks.step, locale);
    return index === ticks.values.length - 1 ? `${text} ${unit}` : text;
  });
  const gutter = Math.ceil(Math.max(...tickLabels.map((text) => text.length)) * 7) + 8;

  const pastCount = buckets.filter((bucket) => bucket.past).length;
  const currentIndex = buckets.findIndex((bucket) => bucket.current);
  const today = currentIndex < 0 ? undefined : (currentIndex + Math.min(Math.max(todayFraction, 0), 1)) / count;
  const labelEvery = Math.ceil(count / MAX_LABELS);
  const labelAnchor = Math.max(currentIndex, 0);

  const points = buckets.map((bucket, index) => (bucket.line === undefined ? undefined : { x: centre(index), y: BASELINE - bucket.line * scale }));
  const stacks = buckets.map((bucket) => stackSegments(bucket.segments, scale));

  const tooltip = (bucket: StackedColumnBucket) =>
    [
      bucket.title ?? bucket.label,
      ...labels.series.slice(0, SERIES_FILLS.length).map((name, series) => `${name}: ${formatFigure(bucket.segments[series] ?? 0, locale)} ${unit}`),
      ...(labels.line && bucket.line !== undefined ? [`${labels.line}: ${formatFigure(bucket.line, locale)} ${unit}`] : []),
      ...(bucket.marker ? [bucket.marker] : []),
    ].join("\n");

  return (
    <div role="img" aria-label={labels.summary} data-slot="stacked-column-chart" className="flex w-full overflow-x-auto">
      <svg width={gutter} height={HEIGHT} className="shrink-0" data-slot="chart-axis">
        {ticks.values.map((value, index) => (
          <text key={value} x={gutter - 8} y={BASELINE - value * scale + 4} textAnchor="end" className="fill-muted-foreground text-xs tabular-nums">
            {tickLabels[index]}
          </text>
        ))}
      </svg>
      <svg height={HEIGHT} className="flex-1" style={{ minWidth: Math.ceil(count * slotMinimum(count)) }} data-slot="chart-plot">
        <defs>
          <pattern id={hatch} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" className="fill-chart-3" fillOpacity={0.25} />
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-chart-3" strokeWidth={3} />
          </pattern>
        </defs>
        {pastCount > 0 && <rect data-slot="chart-past" x="0" y={TOP} width={percent(pastCount / count)} height={PLOT_HEIGHT} className="fill-muted" />}
        {ticks.values.map((value) => (
          <line
            key={value}
            data-slot="chart-gridline"
            x1="0"
            x2="100%"
            y1={BASELINE - value * scale}
            y2={BASELINE - value * scale}
            className="stroke-border"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        ))}
        {buckets.map((bucket, index) => (
          <g key={bucket.key} data-slot="chart-column" data-bucket={bucket.key}>
            <title>{tooltip(bucket)}</title>
            <rect x={percent(index / count)} y={TOP} width={percent(1 / count)} height={PLOT_HEIGHT} fill="transparent" />
            <svg x={percent(centre(index))} overflow="visible">
              {stacks[index]!.map((segment, position) => (
                <path
                  key={segment.series}
                  data-series={segment.series + 1}
                  d={segmentPath(segment, width, position === stacks[index]!.length - 1)}
                  className={segment.series === HATCHED ? undefined : SERIES_FILLS[segment.series]}
                  fill={segment.series === HATCHED ? `url(#${hatch})` : undefined}
                />
              ))}
            </svg>
          </g>
        ))}
        {today !== undefined && (
          <g data-slot="chart-today" pointerEvents="none">
            <line x1={percent(today)} x2={percent(today)} y1={4} y2={BASELINE} className="stroke-foreground" strokeWidth={1} shapeRendering="crispEdges" />
            {today >= CAPTION_ROOM && (
              <text x={percent(today)} dx={-6} y={14} textAnchor="end" className="fill-muted-foreground text-xs">
                {labels.past}
              </text>
            )}
            {today <= 1 - CAPTION_ROOM && (
              <text x={percent(today)} dx={6} y={14} textAnchor="start" className="fill-foreground text-xs">
                {labels.ahead}
              </text>
            )}
          </g>
        )}
        {points.some(Boolean) && (
          <g data-slot="chart-line" pointerEvents="none">
            {points.map((point, index) => {
              const next = points[index + 1];
              if (!point || !next) return null;
              return (
                <line
                  key={buckets[index]!.key}
                  x1={percent(point.x)}
                  y1={point.y}
                  x2={percent(next.x)}
                  y2={next.y}
                  className="stroke-foreground"
                  strokeOpacity={LINE.opacity}
                  strokeWidth={LINE.width}
                />
              );
            })}
            {points.map(
              (point, index) =>
                point && (
                  <circle
                    key={buckets[index]!.key}
                    cx={percent(point.x)}
                    cy={point.y}
                    r={LINE.dot}
                    className="fill-foreground stroke-card"
                    fillOpacity={LINE.opacity}
                    strokeWidth={LINE.ring}
                  />
                ),
            )}
          </g>
        )}
        {buckets.map((bucket, index) => {
          if (!bucket.marker) return null;
          const top = Math.max(totals[index]! * scale, bucket.line === undefined ? 0 : bucket.line * scale);
          const baseline = BASELINE - top - 6;
          return (
            <svg key={bucket.key} data-slot="chart-marker" x={percent(centre(index))} overflow="visible" pointerEvents="none">
              <TriangleAlertIcon aria-hidden="true" x={-6} y={baseline - 24} size={12} className="text-warning" />
              <text x={0} y={baseline} textAnchor="middle" className="fill-warning text-xs font-medium">
                {bucket.marker}
              </text>
            </svg>
          );
        })}
        {buckets.map((bucket, index) =>
          (index - labelAnchor) % labelEvery === 0 ? (
            <text
              key={bucket.key}
              data-slot="chart-label"
              x={percent(centre(index))}
              y={BASELINE + 16}
              textAnchor="middle"
              className={bucket.current ? "fill-foreground text-xs font-medium" : "fill-muted-foreground text-xs"}
            >
              {bucket.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
