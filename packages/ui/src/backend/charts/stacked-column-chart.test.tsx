import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  LINE,
  StackedColumnChart,
  columnWidth,
  formatFigure,
  niceTicks,
  stackSegments,
  type StackedColumnBucket,
  type StackedColumnChartLabels,
  type StackedColumnChartProps,
} from "./stacked-column-chart";

const labels: StackedColumnChartLabels = {
  summary: "Last 2 weeks: 30 SU shipped · this week and next: 25 SU to ship",
  series: ["Shipped", "Open customer orders", "Forecast not yet ordered"],
  line: "Ordered",
  past: "Past · what shipped",
  ahead: "Today and ahead · what is still to ship",
  empty: "Nothing shipped or due in this window",
};

const bucket = (key: string, segments: number[], extra: Partial<StackedColumnBucket> = {}): StackedColumnBucket => ({
  key,
  label: key,
  past: false,
  current: false,
  segments,
  ...extra,
});

/** Two past weeks, the current one and one ahead: top tick 20 (step 5), so 10 px per unit. */
const BUCKETS: StackedColumnBucket[] = [
  bucket("W41", [12], { past: true, line: 14 }),
  bucket("W42", [18], { past: true, line: 16, title: "W42 · 13–19 Oct" }),
  bucket("W43", [4, 6, 5], { current: true, line: 8, marker: "2.5 overdue" }),
  bucket("W44", [0, 3, 7]),
];

function renderChart(props: Partial<StackedColumnChartProps> = {}) {
  const { container } = render(<StackedColumnChart buckets={BUCKETS} todayFraction={0.25} unit="SU" labels={labels} id="demand" {...props} />);
  const plot = container.querySelector<SVGSVGElement>("[data-slot=chart-plot]")!;
  const column = (key: string) => plot.querySelector(`[data-bucket=${key}]`)!;
  const segments = (key: string) => [...column(key).querySelectorAll("path")];
  return { container, plot, column, segments };
}

/** The y values a column segment's path visits (its bottom and top, plus the rounded corner's). */
const ys = (d: string) => [...d.matchAll(/[MV](-?[\d.]+)(?: (-?[\d.]+))?/g)].map((m) => Number(m[2] ?? m[1]));

describe("niceTicks", () => {
  it.each<[number, number, number[]]>([
    [7, 2, [0, 2, 4, 6, 8]],
    [9, 2.5, [0, 2.5, 5, 7.5, 10]],
    [18, 5, [0, 5, 10, 15, 20]],
    [40, 10, [0, 10, 20, 30, 40]],
    [3.6, 1, [0, 1, 2, 3, 4]],
    [0.3, 0.1, [0, 0.1, 0.2, 0.3]],
    [1234, 500, [0, 500, 1000, 1500]],
    [0.009, 0.0025, [0, 0.0025, 0.005, 0.0075, 0.01]],
  ])("covers %s with steps of %s", (max, step, values) => {
    expect(niceTicks(max)).toEqual({ step, top: values.at(-1), values });
  });

  it("always steps by 1, 2, 2.5 or 5 × 10ⁿ and tops out at or above the maximum, within one step", () => {
    for (let max = 0.0013; max < 1e7; max *= 1.37) {
      const { step, top, values } = niceTicks(max);
      const mantissa = Number((step / 10 ** Math.floor(Math.log10(step))).toPrecision(6));
      expect([1, 2, 2.5, 5]).toContain(mantissa);
      expect(top).toBeGreaterThanOrEqual(max);
      expect(top - step).toBeLessThan(max);
      expect(values[0]).toBe(0);
      expect(values.length).toBeGreaterThanOrEqual(2);
      expect(values.length).toBeLessThanOrEqual(9);
    }
  });

  it("takes another target count", () => {
    expect(niceTicks(10, 2).values).toEqual([0, 5, 10]);
  });

  it("falls back to 0–1 for nothing to show", () => {
    for (const max of [0, -4, Number.NaN]) expect(niceTicks(max)).toEqual({ step: 1, top: 1, values: [0, 1] });
  });
});

describe("columnWidth", () => {
  it("is at most 24 px, and narrower as the window holds more buckets", () => {
    expect([0, 1, 16, 27, 43].map(columnWidth)).toEqual([24, 24, 24, 16, 14]);
  });
});

describe("formatFigure", () => {
  it("shows up to one decimal under 100, none from 100 up, and zero as a dash, in the reader's locale", () => {
    expect(["en", "en", "en", "en", "pl"].map((locale, index) => formatFigure([0, 12.34, 99.96, 1234.5, 12.34][index]!, locale))).toEqual([
      "–",
      "12.3",
      "100",
      "1,235",
      "12,3",
    ]);
  });
});

describe("stackSegments", () => {
  it("stacks non-zero values bottom-up with a 2 px gap under every segment but the first", () => {
    expect(stackSegments([10, 0, 5], 2)).toEqual([
      { series: 0, bottom: 0, top: 20 },
      { series: 2, bottom: 22, top: 30 },
    ]);
  });

  it("keeps a segment thinner than the gap as a zero-height sliver, and ignores negatives and a fourth series", () => {
    expect(stackSegments([-3, 10, 0.5, 4], 2)).toEqual([
      { series: 1, bottom: 0, top: 20 },
      { series: 2, bottom: 21, top: 21 },
    ]);
  });
});

describe("StackedColumnChart", () => {
  it("is one image named by its summary, with the tick labels and the unit on the top tick", () => {
    const { container } = renderChart();

    const chart = screen.getByRole("img", { name: labels.summary });
    expect(chart.dataset.slot).toBe("stacked-column-chart");
    const ticks = [...container.querySelectorAll("[data-slot=chart-axis] text")];
    expect(ticks.map((tick) => tick.textContent)).toEqual(["0", "5", "10", "15", "20 SU"]);
    // Top tick at the plot's top (48), 10 px per unit down to the baseline (248); labels sit 4 px below each line.
    expect(ticks.map((tick) => Number(tick.getAttribute("y")))).toEqual([252, 202, 152, 102, 52]);
    expect(ticks[0]!.getAttribute("class")).toContain("fill-muted-foreground");
  });

  it("draws a recessive 1 px gridline per tick across the plot", () => {
    const { plot } = renderChart();

    const lines = [...plot.querySelectorAll("[data-slot=chart-gridline]")];
    expect(lines.map((line) => line.getAttribute("y1"))).toEqual(["248", "198", "148", "98", "48"]);
    for (const line of lines) {
      expect(line.getAttribute("x2")).toBe("100%");
      expect(line.getAttribute("stroke-width")).toBe("1");
      expect(line.getAttribute("class")).toBe("stroke-border");
    }
  });

  it("centres each column in its bucket, 24 px wide, segments stacked with a 2 px gap and only the top one rounded", () => {
    const { column, segments } = renderChart();

    expect(column("W41").querySelector("svg")!.getAttribute("x")).toBe("12.5%");
    expect(column("W43").querySelector("svg")!.getAttribute("x")).toBe("62.5%");
    const [shipped, open, forecast] = segments("W43");
    expect([shipped, open, forecast].map((path) => path!.dataset.series)).toEqual(["1", "2", "3"]);
    expect(shipped!.getAttribute("d")).toBe("M-12 248V208H12V248Z");
    // Open starts 2 px above Shipped's top (208), Forecast 2 px above Open's (148).
    expect(open!.getAttribute("d")).toBe("M-12 206V148H12V206Z");
    expect(forecast!.getAttribute("d")).toBe("M-12 146V102A4 4 0 0 1 -8 98H8A4 4 0 0 1 12 102V146Z");
    expect(ys(forecast!.getAttribute("d")!)).toEqual([146, 102, 146]);
    // A column with one segment rounds it; one with Open and Forecast gaps between them.
    expect(segments("W41")[0]!.getAttribute("d")).toBe("M-12 248V132A4 4 0 0 1 -8 128H8A4 4 0 0 1 12 132V248Z");
    expect(segments("W44").map((path) => path.dataset.series)).toEqual(["2", "3"]);
    expect(segments("W44")[1]!.getAttribute("d")).toMatch(/^M-12 216V/);
  });

  it("caps the corner radius at a short segment's height", () => {
    const { segments } = renderChart({ buckets: [bucket("A", [100]), bucket("B", [1])] });

    // 100 → top tick 100, 2 px per unit: B is 2 px tall, so its corners are 2 px.
    expect(segments("B")[0]!.getAttribute("d")).toBe("M-12 248V248A2 2 0 0 1 -10 246H10A2 2 0 0 1 12 248V248Z");
  });

  it("paints the first two series in their chart tokens and hatches the third with a 45° pattern", () => {
    const { plot, segments } = renderChart();

    const [shipped, open, forecast] = segments("W43");
    expect(shipped!.getAttribute("class")).toBe("fill-chart-1");
    expect(open!.getAttribute("class")).toBe("fill-chart-2");
    expect(forecast!.getAttribute("class")).toBeNull();
    expect(forecast!.getAttribute("fill")).toBe("url(#demand-hatch)");
    const pattern = plot.querySelector("pattern#demand-hatch")!;
    expect(pattern.getAttribute("patternTransform")).toBe("rotate(45)");
    expect(pattern.querySelector("line")!.getAttribute("class")).toBe("stroke-chart-3");
  });

  it("names the hatch after a default id when none is given", () => {
    const { container } = render(<StackedColumnChart buckets={BUCKETS} todayFraction={0} unit="SU" labels={labels} />);
    expect(container.querySelector("pattern")!.id).toBe("stacked-column-chart-hatch");
  });

  it("tints the past buckets only, ending where the current bucket starts", () => {
    const { plot } = renderChart();

    const past = plot.querySelector("[data-slot=chart-past]")!;
    expect(past.getAttribute("x")).toBe("0");
    expect(past.getAttribute("width")).toBe("50%");
    expect(past.getAttribute("class")).toBe("fill-muted");
    expect(renderChart({ buckets: BUCKETS.slice(2) }).plot.querySelector("[data-slot=chart-past]")).toBeNull();
  });

  it("puts the Today rule at todayFraction of the current bucket, with a caption on each side", () => {
    const { plot } = renderChart();

    const today = plot.querySelector("[data-slot=chart-today]")!;
    const rule = today.querySelector("line")!;
    // Bucket 2 of 4, a quarter in: (2 + 0.25) / 4.
    expect(rule.getAttribute("x1")).toBe("56.25%");
    expect(rule.getAttribute("x2")).toBe("56.25%");
    expect(rule.getAttribute("class")).toBe("stroke-foreground");
    const [past, ahead] = [...today.querySelectorAll("text")];
    expect(past!.textContent).toBe("Past · what shipped");
    expect(past!.getAttribute("text-anchor")).toBe("end");
    expect(ahead!.textContent).toBe("Today and ahead · what is still to ship");
    expect(ahead!.getAttribute("text-anchor")).toBe("start");
    expect(ahead!.getAttribute("x")).toBe("56.25%");
  });

  it("drops a caption that has no room beside the rule, clamps the fraction, and has no rule without a current bucket", () => {
    const captions = (props: Partial<StackedColumnChartProps>) =>
      [...renderChart(props).plot.querySelectorAll("[data-slot=chart-today] text")].map((text) => text.textContent);
    const late = BUCKETS.map((b, index) => ({ ...b, past: index < 3, current: index === 3 }));
    expect(captions({ buckets: late, todayFraction: 0.5 })).toEqual([labels.past]);
    const early = BUCKETS.map((b, index) => ({ ...b, past: false, current: index === 0 }));
    expect(captions({ buckets: early, todayFraction: -1 })).toEqual([labels.ahead]);
    expect(renderChart({ buckets: early, todayFraction: -1 }).plot.querySelector("[data-slot=chart-today] line")!.getAttribute("x1")).toBe("0%");
    expect(renderChart({ buckets: late, todayFraction: 7 }).plot.querySelector("[data-slot=chart-today] line")!.getAttribute("x1")).toBe("100%");
    const none = BUCKETS.map((b) => ({ ...b, current: false }));
    expect(renderChart({ buckets: none }).plot.querySelector("[data-slot=chart-today]")).toBeNull();
  });

  it("draws the Ordered line in foreground at 70%, 1.5 px, with 2.5 px dots in a surface ring, breaking where a bucket has no value", () => {
    const { plot } = renderChart();

    const line = plot.querySelector("[data-slot=chart-line]")!;
    const strokes = [...line.querySelectorAll("line")];
    expect(strokes.map((stroke) => [stroke.getAttribute("x1"), stroke.getAttribute("y1"), stroke.getAttribute("x2"), stroke.getAttribute("y2")])).toEqual([
      ["12.5%", "108", "37.5%", "88"],
      ["37.5%", "88", "62.5%", "168"],
    ]);
    for (const stroke of strokes) {
      expect(stroke.getAttribute("class")).toBe("stroke-foreground");
      expect(stroke.getAttribute("stroke-opacity")).toBe(String(LINE.opacity));
      expect(stroke.getAttribute("stroke-width")).toBe("1.5");
    }
    const dots = [...line.querySelectorAll("circle")];
    expect(dots.map((dot) => dot.getAttribute("cy"))).toEqual(["108", "88", "168"]);
    expect(dots[0]!.getAttribute("r")).toBe("2.5");
    expect(dots[0]!.getAttribute("class")).toBe("fill-foreground stroke-card");
    expect(dots[0]!.getAttribute("fill-opacity")).toBe("0.7");

    const gapped = BUCKETS.map((b, index) => ({ ...b, line: index === 1 ? undefined : 5 }));
    const broken = renderChart({ buckets: gapped }).plot.querySelector("[data-slot=chart-line]")!;
    expect(broken.querySelectorAll("line")).toHaveLength(1);
    expect(broken.querySelectorAll("circle")).toHaveLength(3);
    expect(renderChart({ buckets: BUCKETS.map((b) => ({ ...b, line: undefined })) }).plot.querySelector("[data-slot=chart-line]")).toBeNull();
  });

  it("marks the overdue column with its text and a warning icon above the column, or above a higher line dot", () => {
    const { plot } = renderChart();

    const markers = [...plot.querySelectorAll("[data-slot=chart-marker]")];
    expect(markers).toHaveLength(1);
    const marker = markers[0]!;
    expect(marker.getAttribute("x")).toBe("62.5%");
    const text = marker.querySelector("text")!;
    expect(text.textContent).toBe("2.5 overdue");
    expect(text.getAttribute("class")).toContain("fill-warning");
    // A surface-coloured halo keeps the Today rule from striking through it.
    expect([text.getAttribute("class"), text.getAttribute("paint-order")]).toEqual([expect.stringContaining("stroke-background"), "stroke"]);
    // W43 totals 15 → top at 98; the text sits 6 px above it, the icon above the text.
    expect(text.getAttribute("y")).toBe("92");
    const icon = marker.querySelector("svg")!;
    expect(icon.getAttribute("class")).toContain("lucide-triangle-alert");
    expect(icon.getAttribute("class")).toContain("text-warning");
    expect(icon.getAttribute("y")).toBe("68");

    const higherLine = BUCKETS.map((b) => (b.marker ? { ...b, line: 19 } : b));
    expect(renderChart({ buckets: higherLine }).plot.querySelector("[data-slot=chart-marker] text")!.getAttribute("y")).toBe("52");
    const noLine = BUCKETS.map((b) => (b.marker ? { ...b, line: undefined } : b));
    expect(renderChart({ buckets: noLine }).plot.querySelector("[data-slot=chart-marker] text")!.getAttribute("y")).toBe("92");
  });

  it("gives each column a <title> listing its figures, and a hit area across its bucket", () => {
    const { column } = renderChart();

    const title = (key: string) => column(key).querySelector("title")!.textContent;
    expect(title("W41")).toBe("W41\nShipped: 12 SU\nOpen customer orders: – SU\nForecast not yet ordered: – SU\nOrdered: 14 SU");
    expect(title("W42")).toMatch(/^W42 · 13–19 Oct\nShipped: 18 SU/);
    expect(title("W43")).toBe(
      "W43\nShipped: 4 SU\nOpen customer orders: 6 SU\nForecast not yet ordered: 5 SU\nOrdered: 8 SU\n2.5 overdue",
    );
    expect(title("W44")).toBe("W44\nShipped: – SU\nOpen customer orders: 3 SU\nForecast not yet ordered: 7 SU");
    const hit = column("W44").querySelector("rect")!;
    expect([hit.getAttribute("x"), hit.getAttribute("width"), hit.getAttribute("fill")]).toEqual(["75%", "25%", "transparent"]);
  });

  it("leaves the line out of the titles when it has no name, and formats in the given locale", () => {
    const { column } = renderChart({ labels: { ...labels, line: undefined }, locale: "pl", buckets: [bucket("A", [1.25], { line: 2 })] });
    expect(column("A").querySelector("title")!.textContent).toBe("A\nShipped: 1,3 SU\nOpen customer orders: – SU\nForecast not yet ordered: – SU");
  });

  it("labels every bucket of a short window and every third of a 43-day one, always including the current bucket", () => {
    const { plot } = renderChart();
    const labelled = (root: Element) => [...root.querySelectorAll("[data-slot=chart-label]")].map((text) => text.textContent);
    expect(labelled(plot)).toEqual(["W41", "W42", "W43", "W44"]);
    expect(plot.querySelector("[data-slot=chart-label]:nth-of-type(3)")!.getAttribute("class")).toContain("fill-foreground");

    const days = Array.from({ length: 43 }, (_, index) => bucket(`D${index}`, [1], { past: index < 21, current: index === 21 }));
    const long = renderChart({ buckets: days }).plot;
    const shown = labelled(long);
    expect(shown).toHaveLength(15);
    expect(shown).toContain("D21");
    expect(shown.slice(0, 2)).toEqual(["D0", "D3"]);
    expect(long.getAttribute("style")).toContain("min-width: 860px");
    expect(long.querySelector("[data-bucket=D0] path")!.getAttribute("d")).toMatch(/^M-7 /);
  });

  it("shows decimal ticks with the decimals the step needs", () => {
    const { container } = renderChart({ buckets: [bucket("A", [0.009])] });
    expect([...container.querySelectorAll("[data-slot=chart-axis] text")].map((tick) => tick.textContent)).toEqual([
      "0",
      "0.0025",
      "0.005",
      "0.0075",
      "0.01 SU",
    ]);
  });

  it("scales to a line above every column", () => {
    const { container } = renderChart({ buckets: [bucket("A", [2], { line: 9 })] });
    expect(container.querySelector("[data-slot=chart-axis] text:last-child")!.textContent).toBe("10 SU");
  });

  it("replaces an empty window with its message", () => {
    for (const buckets of [[], BUCKETS.map((b) => ({ ...b, segments: [0, 0, 0], line: 0 }))]) {
      const { container, unmount } = render(<StackedColumnChart buckets={buckets} todayFraction={0.5} unit="SU" labels={labels} />);
      expect(screen.getByText("Nothing shipped or due in this window")).toBeTruthy();
      expect(screen.queryByRole("img")).toBeNull();
      expect(container.querySelector("svg")).toBeNull();
      unmount();
    }
  });

  it("takes only plain data: labels hold no function", () => {
    expect(Object.values(labels).flat().every((value) => typeof value === "string")).toBe(true);
  });
});
