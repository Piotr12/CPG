import { HATCHED, LINE, SERIES_FILLS } from "./stacked-column-chart";

export interface ChartLegendItem {
  /** The series' name. Always in a text token, never in the series colour. */
  label: string;
  /** The series as `StackedColumnChart` draws it: 1–3 for a column series (3 is hatched), or `line`. */
  series: 1 | 2 | 3 | "line";
}

const SWATCH = 12;

/** A swatch per item, drawn the way the chart draws its series, and the series' name beside it. */
export function ChartLegend({ items }: { items: ChartLegendItem[] }) {
  return (
    <ul data-slot="chart-legend" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <Swatch series={item.series} />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Swatch({ series }: { series: ChartLegendItem["series"] }) {
  if (series === "line") {
    return (
      <svg aria-hidden="true" data-swatch="line" width={SWATCH + 4} height={SWATCH} className="shrink-0">
        <line x1="0" y1={SWATCH / 2} x2={SWATCH + 4} y2={SWATCH / 2} className="stroke-foreground" strokeOpacity={LINE.opacity} strokeWidth={LINE.width} />
        <circle cx={(SWATCH + 4) / 2} cy={SWATCH / 2} r={LINE.dot} className="fill-foreground stroke-card" fillOpacity={LINE.opacity} strokeWidth={LINE.ring} />
      </svg>
    );
  }
  if (series - 1 === HATCHED) {
    // The chart's 45° hatch, drawn as lines so the swatch needs no pattern id.
    return (
      <svg aria-hidden="true" data-swatch="hatched" width={SWATCH} height={SWATCH} className="shrink-0">
        <rect width={SWATCH} height={SWATCH} rx="2" className={SERIES_FILLS[HATCHED]} fillOpacity={0.25} />
        <path d="M-2 6L6 -2M-2 14L14 -2M6 14L14 6" className="stroke-chart-3" strokeWidth={3} />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" data-swatch="solid" width={SWATCH} height={SWATCH} className="shrink-0">
      <rect width={SWATCH} height={SWATCH} rx="2" className={SERIES_FILLS[series - 1]} />
    </svg>
  );
}
