import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { demandView, figures } from "./demand-review-fixture";
import { bucketLabels, cellOf, chartBuckets, gridLine, headline, shown } from "./demand-review-view";

const ONE = 1_000_000n;
const t = en.demandReview;

describe("shown", () => {
  it("shows up to one decimal under 100, none from 100 up, and zero as a dash, in the reader's locale", () => {
    expect(shown(0n, "en")).toBe("–");
    expect(shown(12_500_000n, "en")).toBe("12.5");
    expect(shown(12_500_000n, "pl")).toBe("12,5");
    expect(shown(150n * ONE + 400_000n, "en")).toBe("150");
  });
});

describe("cellOf", () => {
  const [past, current, future] = demandView().buckets;
  const all = figures({ shipped: 1, open: 2, forecast: 4, ordered: 8, overdue: 2 });
  it("is shipped in the past, still to ship ahead, and both today", () => {
    expect(cellOf(past, all)).toBe(1n * ONE);
    expect(cellOf(current, all)).toBe(7n * ONE);
    expect(cellOf(future, all)).toBe(6n * ONE);
  });
});

describe("bucketLabels", () => {
  it("labels ISO weeks by number, with their Monday in the tooltip", () => {
    expect(bucketLabels(demandView(), "en", t)).toEqual([
      { label: "W42", title: "W42 · Oct 12" },
      { label: "W43", title: "W43 · Oct 19" },
      { label: "W44", title: "W44 · Oct 26" },
    ]);
    expect(bucketLabels(demandView(), "pl", pl.demandReview)[2]).toEqual({ label: "T44", title: "T44 · 26 paź" });
  });

  it("labels days by date and weekday", () => {
    const view = demandView({ bucket: "day", buckets: [{ start: "2026-10-26", end: "2026-10-27", past: false, current: false }] });
    expect(bucketLabels(view, "en", t)).toEqual([{ label: "Oct 26", title: "Mon, Oct 26" }]);
  });

  it("labels months short, with the year on the first one and on January", () => {
    const month = (start: string) => ({ start, end: start, past: false, current: false });
    const view = demandView({ bucket: "month", buckets: [month("2026-11-01"), month("2026-12-01"), month("2027-01-01")] });
    expect(bucketLabels(view, "en", t)).toEqual([
      { label: "Nov 2026", title: "November 2026" },
      { label: "Dec", title: "December 2026" },
      { label: "Jan 2027", title: "January 2027" },
    ]);
  });
});

describe("chartBuckets", () => {
  it("stacks shipped in the past, everything today, and what is still to ship ahead, with Ordered up to today", () => {
    const [past, current, future] = chartBuckets(demandView(), "en", t);
    expect(past).toEqual({ key: "2026-10-12", label: "W42", title: "W42 · Oct 12", past: true, current: false, segments: [12.5, 0, 0], line: 10 });
    expect(current).toMatchObject({ current: true, segments: [30, 60, 22.5], line: 90, marker: "6 overdue" });
    expect(future).toEqual({ key: "2026-10-26", label: "W44", title: "W44 · Oct 26", past: false, current: false, segments: [0, 15, 105] });
  });

  it("marks today only when something is overdue", () => {
    const view = demandView({ total: [figures(), figures({ open: 1 }), figures()] });
    expect(chartBuckets(view, "en", t)[1]).not.toHaveProperty("marker");
  });
});

describe("headline", () => {
  it("adds shipped over the past buckets, and what is still to ship from today on", () => {
    expect(headline(demandView(), "en")).toEqual({ shipped: "12.5", toShip: "203" });
    // Once Earlier or Later moved the window, today's bucket's shipped counts too ("in this window").
    expect(headline(demandView({ offset: 2 }), "en")).toEqual({ shipped: "42.5", toShip: "203" });
  });
});

describe("gridLine", () => {
  it("shows each bucket's cell, their exact total, and the three detail lines with theirs", () => {
    const view = demandView();
    const line = gridLine(view, "00000001", "00000001 — Widget", view.rows[0].figures, "en");
    expect(line).toEqual({
      key: "00000001",
      name: "00000001 — Widget",
      cells: ["12.5", "113", "120"],
      total: "245",
      details: [
        { figure: "open", cells: ["–", "60", "15"], total: "75" },
        { figure: "overdue", cells: ["–", "6", "–"], total: "6" },
        { figure: "forecast", cells: ["–", "22.5", "105"], total: "128" },
      ],
    });
  });
});
