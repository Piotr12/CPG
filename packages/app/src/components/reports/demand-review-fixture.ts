import type { DemandFiguresView, DemandReviewView } from "@cpg/core";

/** A figure set in whole units, as the API sends them: six-decimal texts. */
export const figures = (values: Partial<Record<keyof DemandFiguresView, number>> = {}): DemandFiguresView => {
  const text = (value = 0) => value.toFixed(6);
  return { shipped: text(values.shipped), ordered: text(values.ordered), open: text(values.open), overdue: text(values.overdue), forecast: text(values.forecast) };
};

/**
 * A three-week demand review around Sunday 2026-10-25 (W42 past, W43 current, W44 ahead), in SU for
 * every product: the widget has figures, the gadget is left out for lack of an SU factor.
 */
export function demandView(overrides: Partial<DemandReviewView> = {}): DemandReviewView {
  const widget = [figures({ shipped: 12.5, ordered: 10 }), figures({ shipped: 30, ordered: 90, open: 60, overdue: 6, forecast: 22.5 }), figures({ ordered: 15, open: 15, forecast: 105 })];
  return {
    today: "2026-10-25",
    bucket: "week",
    offset: 0,
    window: { from: "2026-10-12", to: "2026-11-02" },
    unit: "SU",
    units: ["SU"],
    disabledUnits: ["each", "pallet"],
    materials: [],
    locations: [],
    excluded: [{ material: "00000002", code: "NO_STATISTICAL_FACTOR" }],
    buckets: [
      { start: "2026-10-12", end: "2026-10-19", past: true, current: false },
      { start: "2026-10-19", end: "2026-10-26", past: false, current: true, todayFraction: 6 / 7 },
      { start: "2026-10-26", end: "2026-11-02", past: false, current: false },
    ],
    total: widget,
    rows: [{ key: "00000001", figures: widget }],
    omittedRows: 0,
    ...overrides,
  };
}
