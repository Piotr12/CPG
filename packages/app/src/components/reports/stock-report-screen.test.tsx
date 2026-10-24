import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StockReportRow, StockReportView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { StockReportScreen } from "./stock-report-screen";

const steel = { id: "00000001", type: "raw" as const, description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 };
const plant = { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const row: StockReportRow = {
  material: "00000001", materialDescription: "Steel sheet", materialActive: true, baseUnit: "kg",
  location: "00000001", locationName: "Main plant", locationActive: true,
  quantity: "70.000000", inTransitFrom: "30.000000", inTransitTo: "0.000000",
};
const report: StockReportView = { asOf: "2026-10-21", page: 1, pageSize: 100, total: 1, rows: [row] };
const renderScreen = (selected: object = { includeZero: false, page: 1 }) =>
  render(<StockReportScreen tenant={{ code: "test", name: "Test" }} report={report} selected={selected as never} materials={[steel]} locations={[plant]} locale="en" messages={en} />);

describe("StockReportScreen", () => {
  it("heads the report with its one h1 and the as-of date, then quantities right-aligned in tabular figures", () => {
    renderScreen();

    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Stock report — Test"]);
    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(within(header).getByText(/as of 2026-10-21 \(UTC\)/)).toBeTruthy();
    const cells = within(screen.getByRole("table", { name: en.stockReport.label })).getAllByRole("cell");
    expect(cells[0].className).toMatch(/\bsticky left-0\b/);
    expect(cells[1].className).toContain("hidden md:table-cell");
    for (const index of [2, 3, 4]) expect(cells[index].className).toMatch(/\btext-right tabular-nums\b.*\bhidden md:table-cell\b/);
    expect(cells[2].textContent).toBe("70 kg");
    // The phone stand-in for the three figures shows only below md.
    expect(cells[5].className).toContain("md:hidden");
    expect(screen.queryByRole("link", { name: en.stockReport.clear })).toBeNull();
  });

  it("offers Clear filters once a filter is applied", () => {
    renderScreen({ material: "00000001", includeZero: false, page: 1 });
    expect(screen.getByRole("link", { name: en.stockReport.clear }).getAttribute("href")).toBe("/admin/test/reports/stock");
  });

  it("counts showing zero rows as a filter too", () => {
    renderScreen({ includeZero: true, page: 1 });
    expect(screen.getByRole("link", { name: en.stockReport.clear })).toBeTruthy();
  });
});
