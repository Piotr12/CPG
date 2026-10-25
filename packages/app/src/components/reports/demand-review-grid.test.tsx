import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemandReviewGrid, type DemandReviewGridLabels, type GridBucket } from "./demand-review-grid";
import type { GridLine } from "./demand-review-view";

const labels: DemandReviewGridLabels = {
  label: "Shipped and still to ship",
  caption: "1 product · SU per week",
  rows: "Product",
  total: "Total",
  totalRow: "Total (SU)",
  details: { open: "Open orders", overdue: "of which overdue", forecast: "Forecast not yet ordered" },
  toggle: "Details of {name}",
  empty: "Nothing shipped or due in this window.",
};
const buckets: GridBucket[] = [
  { key: "2026-10-12", label: "W42", title: "W42 · Oct 12", past: true, current: false },
  { key: "2026-10-19", label: "W43", title: "W43 · Oct 19", past: false, current: true },
  { key: "2026-10-26", label: "W44", title: "W44 · Oct 26", past: false, current: false },
];
const line: GridLine = {
  key: "00000001",
  name: "00000001 — Widget",
  cells: ["12.5", "113", "120"],
  total: "245",
  details: [
    { figure: "open", cells: ["–", "60", "15"], total: "75" },
    { figure: "overdue", cells: ["–", "6", "–"], total: "6" },
    { figure: "forecast", cells: ["–", "22.5", "105"], total: "128" },
  ],
};
const total: GridLine = { ...line, key: "total", name: "" };
const grid = () => within(screen.getByRole("table", { name: labels.label }));
afterEach(() => vi.restoreAllMocks());

describe("DemandReviewGrid", () => {
  it("shows each row's buckets and total, past columns tinted and today's ruled, the first column sticky", () => {
    render(<DemandReviewGrid buckets={buckets} lines={[line]} total={total} labels={labels} />);
    const headers = grid().getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Product", "W42", "W43", "W44", "Total"]);
    expect(headers[0].className).toContain("sticky left-0");
    expect(headers[1].className).toContain("bg-muted");
    expect(headers[2].className).toContain("border-x-2 border-foreground");
    expect(headers[2].getAttribute("title")).toBe("W43 · Oct 19");
    const row = grid().getAllByRole("row").find((candidate) => candidate.dataset.gridRow === "00000001")!;
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["12.5", "113", "120", "245"]);
    const footer = grid().getAllByRole("row").find((candidate) => candidate.dataset.gridTotal !== undefined)!;
    expect(within(footer).getByRole("rowheader").textContent).toBe("Total (SU)");
    expect(screen.getByText(labels.caption).tagName).toBe("CAPTION");
  });

  it("opens and closes a row's open orders, overdue part and forecast, marking an overdue figure", () => {
    render(<DemandReviewGrid buckets={buckets} lines={[line]} total={total} labels={labels} />);
    const toggle = screen.getByRole("button", { name: "Details of 00000001 — Widget" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const details = grid().getAllByRole("row").filter((row) => row.dataset.gridDetail);
    expect(details.map((row) => within(row).getByRole("rowheader").textContent)).toEqual(["Open orders", "of which overdue", "Forecast not yet ordered"]);
    const overdue = within(details[1]).getAllByRole("cell");
    expect(overdue[1].querySelector(".text-warning")?.textContent).toBe("6");
    expect(overdue[0].querySelector(".text-warning")).toBeNull();
    expect(within(details[2]).getAllByRole("cell").at(-1)!.textContent).toBe("128");
    fireEvent.click(toggle);
    expect(grid().getAllByRole("row").filter((row) => row.dataset.gridDetail)).toEqual([]);
  });

  it("opens scrolled so today's column follows the sticky first column", () => {
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.current ? 500 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(180);
    render(<DemandReviewGrid buckets={buckets} lines={[line]} total={total} labels={labels} />);
    expect(screen.getByRole("region", { name: labels.label }).scrollLeft).toBe(320);
  });

  it("stays at the start when the window doesn't hold today", () => {
    render(<DemandReviewGrid buckets={buckets.map((bucket) => ({ ...bucket, current: false }))} lines={[line]} total={total} labels={labels} />);
    expect(screen.getByRole("region", { name: labels.label }).scrollLeft).toBe(0);
  });

  it("shows its empty state when no row has a figure", () => {
    render(<DemandReviewGrid buckets={buckets} lines={[]} total={total} labels={labels} />);
    expect(screen.getByText(labels.empty)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
