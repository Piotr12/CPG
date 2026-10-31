import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MrpBucketView, MrpLatestView, MrpPlanView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { MrpReport } from "./mrp-report";

const zero = "0.000000";
const day = (date: string, figures: Partial<MrpBucketView> = {}): MrpBucketView => ({
  date, firmDemand: zero, forecastDemand: zero, dependentDemand: zero, transferOut: zero, tentativeSupply: zero, dependableSupply: zero, atRiskSupply: zero,
  transferIn: zero, proposedReceipts: zero, safetyTarget: zero, projectedBefore: "50.000000", projectedAfter: "50.000000", shortage: zero, ...figures,
});
/** MRP-005: physical 50, Open lines of 10 due 5 October and 15 due 7 October, a run on 1 October. */
const sheet: MrpPlanView = {
  material: "00000012", materialDescription: "Steel sheet", materialActive: true, baseUnit: "kg",
  location: "00000003", locationName: "Kraków", locationActive: true, lowestProjectedBefore: "25.000000", firstShortageDate: null,
  buckets: [
    day("2026-10-04"),
    day("2026-10-05", { firmDemand: "10.000000", projectedBefore: "40.000000", projectedAfter: "40.000000" }),
    day("2026-10-06", { projectedBefore: "40.000000", projectedAfter: "40.000000" }),
    day("2026-10-07", { firmDemand: "15.000000", projectedBefore: "25.000000", projectedAfter: "25.000000" }),
  ],
};
const bearing: MrpPlanView = {
  ...sheet, material: "00000013", materialDescription: "Bearing", materialActive: false, baseUnit: "each", locationActive: false,
  lowestProjectedBefore: "-1234.500000", firstShortageDate: "2026-10-02",
  buckets: [day("2026-10-01", { projectedBefore: "5.000000" }), day("2026-10-02", { firmDemand: "1239.500000", projectedBefore: "-1234.500000", projectedAfter: "-1234.500000", shortage: "1234.500000" })],
};
const run = { id: "00000004", createdAt: new Date(), account: "anna", channel: "ui" as const, mode: "manual" as const, generation: 1, startDate: "2026-10-01", endDate: "2026-12-29", horizonDays: 90, pairs: 2 };
const report = (overrides: Partial<MrpLatestView> = {}): MrpLatestView => ({ run, page: 1, pageSize: 25, total: 2, plans: [sheet, bearing], ...overrides });
const renderReport = (view: MrpLatestView, selected: { material?: string; location?: string; page: number } = { page: 1 }, locale: "en" | "pl" = "en") =>
  render(<MrpReport tenant={{ code: "test" }} report={view} selected={selected} materials={[]} locations={[]} locale={locale} messages={locale === "en" ? en : pl} />);
const pairs = () => within(screen.getByRole("table", { name: en.mrp.report.label }));

describe("MrpReport", () => {
  it("lists the run's pairs with their lowest projected balance and first shortage, marking shortages and inactive records", () => {
    renderReport(report());

    expect(screen.getByRole("heading", { level: 2, name: "Report" })).toBeTruthy();
    expect(document.querySelector("[data-mrp-pair-count]")?.textContent).toBe("Planned pairs: 2");
    const rows = pairs().getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("00000012 — Steel sheet")).toBeTruthy();
    expect(rows[0].querySelector("[data-mrp-lowest]")?.textContent).toBe("25 kg");
    expect(rows[0].querySelector("[data-mrp-lowest]")?.className).not.toContain("text-danger");
    expect(rows[0].querySelector("[data-mrp-first-shortage]")?.textContent).toBe("None");
    expect(within(rows[1]).getByText("00000013 — Bearing (Inactive)")).toBeTruthy();
    expect(within(rows[1]).getAllByText("00000003 — Kraków (Inactive)").length).toBeGreaterThan(0);
    expect(rows[1].querySelector("[data-mrp-lowest]")?.textContent).toBe("-1,234.5 each");
    expect(rows[1].querySelector("[data-mrp-lowest]")?.className).toContain("text-danger");
    expect(rows[1].querySelector("[data-mrp-first-shortage]")?.textContent).toBe("2026-10-02");
    expect(rows[1].querySelector("td")?.className).toContain("border-l-danger");
    expect(rows[0].querySelector("td")?.className).not.toContain("border-l-danger");
  });

  it("opens a pair's days through a labelled link to the page filtered to it, and shows no day table while several pairs are listed", () => {
    renderReport(report());

    const link = screen.getByRole("link", { name: "Days of 00000012 Steel sheet at 00000003 Kraków" });
    expect(link.getAttribute("href")).toBe("/admin/test/mrp?material=00000012&location=00000003");
    expect(link.textContent).toBe("Days");
    expect(screen.queryByRole("table", { name: en.mrp.report.planLabel })).toBeNull();
  });

  it("keeps the filters in the page links, and offers Clear filters once one is set", () => {
    renderReport(report({ total: 60, page: 2 }), { location: "00000003", page: 2 });

    const pages = within(screen.getByRole("navigation", { name: en.mrp.report.pagination }));
    expect(pages.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/mrp?location=00000003&page=1");
    expect(pages.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/mrp?location=00000003&page=3");
    expect(screen.getByRole("link", { name: en.mrp.report.clear }).getAttribute("href")).toBe("/admin/test/mrp");
  });

  it("pages without filters it doesn't have, and offers no Clear filters then", () => {
    renderReport(report({ total: 30 }));

    expect(within(screen.getByRole("navigation", { name: en.mrp.report.pagination })).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/mrp?page=2");
    expect(screen.queryByRole("link", { name: en.mrp.report.clear })).toBeNull();
  });

  it("says when no planned pair matches the filters", () => {
    renderReport(report({ total: 0, plans: [] }), { material: "00000099", page: 1 });

    expect(screen.getByText(en.mrp.report.empty)).toBeTruthy();
    expect(document.querySelector("[data-mrp-pair-count]")?.textContent).toBe("Planned pairs: 0");
  });

  it("says an unfiltered run planned nothing, rather than blaming filters it doesn't have", () => {
    renderReport(report({ total: 0, plans: [], run: { ...run, pairs: 0 } }));

    expect(screen.getByText(en.mrp.report.emptyRun)).toBeTruthy();
    expect(screen.queryByText(en.mrp.report.empty)).toBeNull();
  });

  it("shows the one pair the filters leave, day by day, with its eight figures in its base unit (MRP-005)", () => {
    renderReport(report({ total: 1, plans: [sheet] }), { material: "00000012", location: "00000003", page: 1 });

    expect(screen.getByRole("heading", { level: 3, name: "00000012 Steel sheet at 00000003 Kraków" })).toBeTruthy();
    expect(screen.getByText(/^Quantities in kg\./)).toBeTruthy();
    const days = within(screen.getByRole("table", { name: en.mrp.report.planLabel }));
    expect(days.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Date", "Firm demand", "Forecast demand", "Safety stock", "Tentative supply", "Dependable supply", "Projected before proposals", "Projected after proposals", "Shortage",
    ]);
    // The long headers wrap rather than push the last columns out of view at desktop widths.
    for (const header of days.getAllByRole("columnheader").slice(1)) expect(header.className).toContain("whitespace-normal");
    const figures = (date: string) => {
      const row = days.getByText(date).closest("tr")!;
      return Object.fromEntries([...row.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent]));
    };
    expect(figures("2026-10-05")).toMatchObject({ firmDemand: "10", projectedBefore: "40", projectedAfter: "40", shortage: "0" });
    expect(figures("2026-10-06")).toMatchObject({ firmDemand: "0", projectedBefore: "40" });
    expect(figures("2026-10-07")).toMatchObject({ firmDemand: "15", projectedBefore: "25" });
  });

  it("marks a day short of stock, and its negative balances, in the reader's locale", () => {
    renderReport(report({ total: 1, plans: [bearing] }), { material: "00000013", page: 1 }, "pl");

    const days = within(screen.getByRole("table", { name: pl.mrp.report.planLabel }));
    const row = days.getByText("2026-10-02").closest("tr")!;
    const before = row.querySelector("[data-mrp-figure=projectedBefore]")!;
    expect(before.textContent).toBe("-1234,5");
    expect(before.className).toContain("text-danger");
    expect(row.querySelector("[data-mrp-figure=shortage]")?.textContent).toBe("1234,5");
    expect(row.querySelector("td")?.className).toContain("border-l-danger");
    expect(days.getByText("2026-10-01").closest("tr")!.querySelector("td")?.className).not.toContain("border-l-danger");
    expect(screen.getByText(/^Ilości w each\./)).toBeTruthy();
  });
});
