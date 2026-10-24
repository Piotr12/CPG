import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VarianceReportRow, VarianceReportView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { VarianceReportScreen } from "./variance-report-screen";

const row = (overrides: Partial<VarianceReportRow> = {}): VarianceReportRow => ({
  id: "00000001", output: "00000001", outputDescription: "Chocolate bar", baseUnit: "each", location: "00000001", locationName: "Main plant",
  status: "completed", bom: "00000003", revision: 2, target: "40.000000", produced: "40.000000", outputVariance: null,
  completions: 1, wasteCompletions: 0, reversed: [], components: [],
  ...overrides,
});
const report = (rows: VarianceReportRow[]): VarianceReportView => ({ asOf: "2026-10-21", page: 1, pageSize: 50, total: rows.length, rows });
const renderScreen = (props: { report?: VarianceReportView | null; selected?: object; rangeError?: string; messages?: typeof en } = {}) =>
  render(
    <VarianceReportScreen
      tenant={{ code: "test", name: "Test" }}
      report={props.report === undefined ? report([row()]) : props.report}
      selected={props.selected ?? {}}
      rangeError={props.rangeError}
      materials={[]}
      locations={[]}
      locale="en"
      messages={props.messages ?? en}
    />,
  );

describe("VarianceReportScreen", () => {
  it("heads the report with its one h1, and shows each order's state from the tone map", () => {
    renderScreen({ report: report([row(), row({ id: "00000002", status: "closed-early" }), row({ id: "00000003", status: "open" })]) });

    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Variance report — Test"]);
    const states = [...document.querySelectorAll<HTMLElement>("tbody [data-slot=status-badge]")].map((badge) => [badge.textContent, badge.dataset.tone]);
    expect(states).toEqual([
      ["Completed", "success"],
      ["Closed Early", "warning"],
      ["Open", "neutral"],
    ]);
    expect(screen.queryByRole("link", { name: en.varianceReport.clear })).toBeNull();
  });

  it("marks waste postings with a warning badge, figures in tabular numbers, and an unknown variance as none", () => {
    renderScreen({ report: report([row({ wasteCompletions: 2 })]) });

    const output = within(screen.getByRole("table", { name: en.varianceReport.label })).getAllByRole("cell")[1];
    const waste = within(output).getByText("Waste");
    expect([waste.dataset.slot, waste.dataset.tone]).toEqual(["status-badge", "warning"]);
    expect(within(output).getAllByText("40 each", { selector: "dd" }).every((figure) => figure.className.includes("tabular-nums"))).toBe(true);
    expect(within(output).getByText("—").getAttribute("aria-label")).toBe("none");
  });

  it("explains a refused range beside the form, as an icon and danger text, and offers Clear filters", () => {
    renderScreen({ report: null, selected: { from: "2026-10-10", to: "2026-10-01" }, rangeError: en.varianceReport.rangeError, messages: en });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(en.varianceReport.rangeError);
    expect(alert.className).toContain("text-danger");
    expect(alert.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByLabelText(en.varianceReport.to).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("link", { name: en.varianceReport.clear }).getAttribute("href")).toBe("/admin/test/reports/variance");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("speaks Polish", () => {
    renderScreen({ selected: { status: "open" }, messages: pl });

    expect(screen.getByRole("link", { name: "Wyczyść filtry" })).toBeTruthy();
  });
});
