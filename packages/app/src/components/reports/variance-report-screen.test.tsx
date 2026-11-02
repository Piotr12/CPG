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
const renderScreen = (props: { report?: VarianceReportView | null; selected?: object; rangeError?: string; messages?: typeof en; locale?: "en" | "pl" } = {}) =>
  render(
    <VarianceReportScreen
      tenant={{ code: "test", name: "Test" }}
      report={props.report === undefined ? report([row()]) : props.report}
      selected={props.selected ?? {}}
      rangeError={props.rangeError}
      materials={[]}
      locations={[]}
      locale={props.locale ?? "en"}
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

  it.each([
    ["en", en, "12,345.5", "12,000.25", "-345.25", ["12,345.5 kg", "13,579.75 kg", "+1,234.25 kg", "10,000.5 kg"]],
    ["pl", pl, "12 345,5", "12 000,25", "-345,25", ["12 345,5 kg", "13 579,75 kg", "+1234,25 kg", "10 000,5 kg"]],
  ] as const)("shows the targets, output variance and component figures in %s", (locale, messages, target, produced, variance, figures) => {
    const component = { material: "00000002", description: "Cocoa", baseUnit: "kg", expected: "12345.500000", actual: "13579.750000", variance: "1234.250000", waste: "10000.500000", extra: false };
    renderScreen({ locale, messages, report: report([row({ target: "12345.500000", produced: "12000.250000", outputVariance: "-345.250000", components: [component] })]) });
    const text = (element: Element) => element.textContent!.replace(/\u00a0/g, " ");
    const output = document.querySelector("td [data-report-output]")!;
    expect([...output.querySelectorAll("dd")].slice(0, 3).map(text)).toEqual([`${target} each`, `${produced} each`, `${variance} each`]);
    expect([...document.querySelectorAll("[data-report-component] td")].slice(1).map(text)).toEqual(figures);
    expect([...document.querySelectorAll("[data-report-stacked] dd")].map(text)).toEqual(figures);
  });

  it("speaks Polish", () => {
    renderScreen({ selected: { status: "open" }, messages: pl });

    expect(screen.getByRole("link", { name: "Wyczyść filtry" })).toBeTruthy();
  });
});
