import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MrpBucketView, MrpLatestView, MrpMarkView, MrpPlanView, MrpWeekView } from "@cpg/core";
import type { MrpReportPageQuery } from "@cpg/core/validators/mrp/mrp-latest.schema";
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
  proposals: [],
  exceptions: [],
  marks: [],
};
const bearing: MrpPlanView = {
  ...sheet, material: "00000013", materialDescription: "Bearing", materialActive: false, baseUnit: "each", locationActive: false,
  lowestProjectedBefore: "-1234.500000", firstShortageDate: "2026-10-02",
  buckets: [day("2026-10-01", { projectedBefore: "5.000000" }), day("2026-10-02", { firmDemand: "1239.500000", projectedBefore: "-1234.500000", projectedAfter: "-1234.500000", shortage: "1234.500000" })],
};
const run = { id: "00000004", createdAt: new Date(), account: "anna", channel: "ui" as const, mode: "manual" as const, generation: 1, startDate: "2026-10-01", endDate: "2026-12-29", horizonDays: 90, pairs: 2 };
const report = (overrides: Partial<MrpLatestView> = {}): MrpLatestView => ({ run, bucket: "day", page: 1, pageSize: 25, total: 2, plans: [sheet, bearing], ...overrides });
vi.mock("next/navigation", async (original) => ({ ...(await original<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
const accept = vi.fn();
const renderReport = (view: MrpLatestView, selected: Partial<MrpReportPageQuery> = {}, locale: "en" | "pl" = "en") =>
  render(
    <MrpReport
      tenant={{ code: "test" }}
      report={view}
      selected={{ page: 1, bucket: "day", ...selected }}
      materials={[]}
      locations={[]}
      today="2026-10-01"
      accept={accept}
      locale={locale}
      messages={locale === "en" ? en : pl}
    />,
  );
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

  it("shows the one pair the filters leave, day by day, with its eleven figures in its base unit (MRP-005)", () => {
    renderReport(report({ total: 1, plans: [sheet] }), { material: "00000012", location: "00000003", page: 1 });

    expect(screen.getByRole("heading", { level: 3, name: "00000012 Steel sheet at 00000003 Kraków" })).toBeTruthy();
    expect(screen.getByText(/^Quantities in kg\./)).toBeTruthy();
    const days = within(screen.getByRole("table", { name: en.mrp.report.planLabel }));
    expect(days.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Date", "Firm demand", "Forecast demand", "Dependent demand", "Transfer out", "Safety stock", "Tentative supply", "Dependable supply", "Transfer in",
      "Projected before proposals", "Projected after proposals", "Shortage", "Warnings",
    ]);
    // The long headers wrap rather than push the last columns out of view at desktop widths.
    for (const header of days.getAllByRole("columnheader").slice(1, -1)) expect(header.className).toContain("whitespace-normal");
    const figures = (date: string) => {
      const row = days.getByText(date).closest("tr")!;
      return Object.fromEntries([...row.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent]));
    };
    expect(figures("2026-10-05")).toMatchObject({ firmDemand: "10", projectedBefore: "40", projectedAfter: "40", shortage: "0" });
    expect(figures("2026-10-06")).toMatchObject({ firmDemand: "0", projectedBefore: "40" });
    expect(figures("2026-10-07")).toMatchObject({ firmDemand: "15", projectedBefore: "25" });
  });

  it("shows the production and transfer figures behind a day's balance, so every term of it is a column (#277)", () => {
    const plant: MrpPlanView = {
      ...sheet,
      buckets: [day("2026-10-05", { dependentDemand: "30.000000", transferOut: "20.000000", dependableSupply: "10.000000", transferIn: "5.000000", projectedBefore: "15.000000", projectedAfter: "15.000000" })],
    };
    renderReport(report({ total: 1, plans: [plant] }), { material: "00000012", location: "00000003", page: 1 });

    const row = within(screen.getByRole("table", { name: en.mrp.report.planLabel })).getByText("2026-10-05").closest("tr")!;
    const figures = Object.fromEntries([...row.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent]));
    // 50 − 30 components − 20 dispatched + 10 produced + 5 received = 15.
    expect(figures).toMatchObject({ dependentDemand: "30", transferOut: "20", dependableSupply: "10", transferIn: "5", projectedBefore: "15" });
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

  it("counts each pair's proposals, and lists the one pair's proposals above its days with Accept (E19-S01)", () => {
    const proposal = { id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", kind: "purchase-requisition" as const, needDate: "2026-10-05", quantity: "40.000000", plannedStart: "2026-10-03", plannedFinish: "2026-10-05", lateDays: 0, beyondHorizon: false, executable: true, document: null, bom: null, bomRevision: null };
    const proposing = { ...sheet, proposals: [proposal] };
    renderReport(report({ plans: [proposing, bearing] }));
    expect([...document.querySelectorAll("[data-mrp-proposal-count]")].map((cell) => cell.textContent)).toEqual(["1", "0"]);
    expect(document.querySelector("[data-mrp-proposals]")).toBeNull();

    renderReport(report({ total: 1, plans: [proposing] }), { material: "00000012", location: "00000003", page: 1 });
    const section = document.querySelector("[data-mrp-proposals]")!;
    expect(section.compareDocumentPosition(screen.getByRole("table", { name: en.mrp.report.planLabel })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section as HTMLElement).getByRole("button", { name: "Accept the Purchase requisition of 40 kg on 2026-10-05" })).toBeTruthy();
  });

  describe("weeks and marks (E18-S02)", () => {
    const zeroWeek = Object.fromEntries(["firmDemand", "forecastDemand", "dependentDemand", "transferOut", "tentativeSupply", "dependableSupply", "atRiskSupply", "transferIn", "proposedReceipts", "safetyTarget", "projectedBefore", "projectedAfter"].map((key) => [key, zero]));
    const week = (overrides: Partial<MrpWeekView>): MrpWeekView => ({
      ...(zeroWeek as Record<string, string>), start: "2026-10-05", end: "2026-10-11", year: 2026, week: 41, partial: false, lowestProjectedBefore: zero, peakShortage: zero, marks: [], ...overrides,
    }) as MrpWeekView;
    const overdue: MrpMarkView = { kind: "overdue-supply", date: "2026-10-01", source: "purchase-order", document: "00000003", position: 1, plannedDate: "2026-09-28", quantity: "30.000000" };
    const transit: MrpMarkView = { kind: "overdue-transfer", date: "2026-10-01", transfer: "00000002", stage: "in-transit", plannedDate: "2026-09-30", quantity: "25.000000" };
    const late: MrpMarkView = { kind: "late-supply", date: "2026-10-04", proposal: "p1", plannedFinish: "2026-10-08", lateDays: 4, quantity: "12.000000" };
    /** UX-027's W41 after a partial W40 that holds the UX-018 marks. */
    const weeks = [
      week({ start: "2026-10-01", end: "2026-10-04", week: 40, partial: true, projectedBefore: "10.000000", projectedAfter: "10.000000", lowestProjectedBefore: "10.000000", marks: [overdue, transit, late] }),
      week({ firmDemand: "56.000000", dependableSupply: "50.000000", projectedBefore: "4.000000", projectedAfter: "4.000000", lowestProjectedBefore: "-10.000000", peakShortage: "10.000000" }),
    ];
    const weekly: MrpPlanView = { ...sheet, buckets: [day("2026-10-01"), day("2026-10-04")], marks: [overdue, transit, late], weeks };

    it("offers a View switch on Day by default, and Week alone shows Clear filters but keeps the run's empty text", () => {
      renderReport(report());
      const group = screen.getByRole("radiogroup", { name: "View" });
      expect(within(group).getByRole("radio", { name: "Day" })).toHaveProperty("checked", true);
      expect(within(group).getByRole("radio", { name: "Week" })).toHaveProperty("checked", false);
      expect(screen.getByText(en.mrp.report.viewHint)).toBeTruthy();
      expect(screen.queryByRole("link", { name: en.mrp.report.clear })).toBeNull();

      renderReport(report({ total: 0, plans: [], run: { ...run, pairs: 0 } }), { bucket: "week" });
      expect(screen.getAllByRole("link", { name: en.mrp.report.clear }).at(-1)!.getAttribute("href")).toBe("/admin/test/mrp");
      expect(screen.getByText(en.mrp.report.emptyRun)).toBeTruthy();
    });

    it("keeps the Week view in the Days links and the page links (spec Q9)", () => {
      renderReport(report({ total: 60, page: 2, bucket: "week" }), { bucket: "week", page: 2 });
      expect(screen.getByRole("link", { name: "Days of 00000012 Steel sheet at 00000003 Kraków" }).getAttribute("href")).toBe("/admin/test/mrp?material=00000012&location=00000003&bucket=week");
      const pages = within(screen.getByRole("navigation", { name: en.mrp.report.pagination }));
      expect(pages.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/mrp?bucket=week&page=3");
      expect(within(screen.getByRole("radiogroup", { name: "View" })).getByRole("radio", { name: "Week" })).toHaveProperty("checked", true);
    });

    it("UX-027: shows the one pair's weeks, flows summed, balances at week end, the weakest day's two figures, a cut week labelled partial", () => {
      renderReport(report({ total: 1, plans: [weekly], bucket: "week" }), { material: "00000012", location: "00000003", bucket: "week" });

      expect(screen.queryByRole("table", { name: en.mrp.report.planLabel })).toBeNull();
      expect(screen.getByRole("heading", { level: 3, name: "00000012 Steel sheet at 00000003 Kraków, by week" })).toBeTruthy();
      expect(screen.getByText(/^Quantities in kg\. Flows are summed/)).toBeTruthy();
      const table = within(screen.getByRole("table", { name: en.mrp.report.weekLabel }));
      expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Week", "Firm demand", "Forecast demand", "Dependent demand", "Transfer out", "Safety stock", "Tentative supply", "Dependable supply", "Transfer in",
        "Projected before proposals", "Projected after proposals", "Lowest projected balance", "Peak shortage", "Warnings",
      ]);
      const [first, second] = table.getAllByRole("row").slice(1);
      expect(first.querySelector("[data-mrp-week]")?.textContent).toBe("W40 · Oct 1");
      expect(first.querySelector("[data-mrp-week-range]")?.textContent).toBe("Oct 1–Oct 4, partial");
      expect(second.querySelector("[data-mrp-week-range]")?.textContent).toBe("Oct 5–Oct 11");
      const figures = Object.fromEntries([...second.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent]));
      expect(figures).toMatchObject({ firmDemand: "56", dependableSupply: "50", projectedBefore: "4", lowestProjectedBefore: "-10", peakShortage: "10" });
      expect(second.querySelector("[data-mrp-figure=lowestProjectedBefore]")?.className).toContain("text-danger");
      expect(second.querySelector("td")?.className).toContain("border-l-danger");
      expect(first.querySelector("td")?.className).not.toContain("border-l-danger");
      expect([...first.querySelectorAll("[data-mrp-mark]")].map((mark) => mark.getAttribute("data-mrp-mark"))).toEqual(["overdue-supply", "overdue-transfer", "late-supply"]);
      expect(second.querySelector("[data-mrp-marks]")).toBeNull();
    });

    it("labels a one-day week by its single date, as when a run starts on a Sunday", () => {
      const sunday = { ...weekly, weeks: [week({ start: "2026-11-01", end: "2026-11-01", week: 44, partial: true })] };
      renderReport(report({ total: 1, plans: [sunday], bucket: "week" }), { material: "00000012", location: "00000003", bucket: "week" });
      expect(document.querySelector("[data-mrp-week-range]")?.textContent).toBe("Nov 1, partial");
    });

    it("shows the day view when a weekly read has no weeks, as a plan read by day", () => {
      renderReport(report({ total: 1, plans: [sheet] }), { material: "00000012", location: "00000003", bucket: "week" });
      expect(screen.getByRole("table", { name: en.mrp.report.planLabel })).toBeTruthy();
    });

    it("UX-018: marks each day with its warnings, in Polish too, icon and text on the warning tone", () => {
      renderReport(report({ total: 1, plans: [weekly] }), { material: "00000012", location: "00000003" }, "pl");
      const days = within(screen.getByRole("table", { name: pl.mrp.report.planLabel }));
      const marks = [...days.getByText("2026-10-01").closest("tr")!.querySelectorAll("[data-slot=status-badge]")];
      expect(marks.map((mark) => mark.textContent)).toEqual([
        "Zaległa dostawa · Zamówienie zakupu 00000003/1 · termin 28 wrz · 30 kg",
        "Zaległe przesunięcie · 00000002 · termin 30 wrz · 25 kg",
      ]);
      expect(marks.every((mark) => mark.getAttribute("data-tone") === "warning" && mark.querySelector("svg"))).toBe(true);
      expect(days.getByText("2026-10-04").closest("tr")!.querySelector("[data-mrp-mark=late-supply]")?.textContent).toBe("Opóźniona dostawa · 4 dni · koniec 8 paź · 12 kg");
    });
  });
});
