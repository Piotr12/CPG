import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type VarianceReportComponent, type VarianceReportRow, type VarianceReportView } from "@cpg/core";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { en } from "../../../../../i18n/messages/en";
import { pl } from "../../../../../i18n/messages/pl";
import VarianceReportPage from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), requireUser: vi.fn(), tenantScope: vi.fn(), getMessages: vi.fn(), read: vi.fn(), materials: vi.fn(), locations: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const bar = { id: "00000001", type: "finished", description: "Chocolate bar", baseUnit: "each", active: true, createdAt: new Date(), version: 1 };
const milk = { ...bar, id: "00000004", type: "raw", description: "Milk powder", baseUnit: "kg", active: false };
const plant = { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const depot = { ...plant, id: "00000002", name: "Depot", active: false };
const component = (overrides: Partial<VarianceReportComponent> = {}): VarianceReportComponent => ({
  material: "00000002", description: "Cocoa mass", baseUnit: "kg", extra: false,
  expected: "20.000000", actual: "18.000000", variance: "-2.000000", waste: "0.000000", ...overrides,
});
const row = (overrides: Partial<VarianceReportRow> = {}): VarianceReportRow => ({
  id: "00000001", output: "00000001", outputDescription: "Chocolate bar", baseUnit: "each", location: "00000001", locationName: "Main plant",
  status: "completed", bom: "00000003", revision: 2, target: "40.000000", produced: "40.000000", outputVariance: "0.000000",
  completions: 1, wasteCompletions: 0, reversed: [],
  components: [component(), component({ material: "00000004", description: "Milk powder", extra: true, expected: "0.000000", actual: "2.000000", variance: "2.000000" })],
  ...overrides,
});
const report = (overrides: Partial<VarianceReportView> = {}): VarianceReportView => ({ asOf: "2026-10-21", page: 1, pageSize: 50, total: 2, rows: [
  row(),
  row({
    id: "00000002", status: "open", target: "100.000000", produced: "40.000000", outputVariance: "-60.000000", completions: 2, wasteCompletions: 1, reversed: ["00000007", "00000009"],
    components: [component({ expected: "20.000000", actual: "30.000000", variance: "10.000000", waste: "10.000000" })],
  }),
], ...overrides });
const scope = (readOnly = false) => ({ cradle: { tenant: { ...tenant, readOnly }, varianceReportService: { read: mocks.read }, materialService: { list: mocks.materials }, locationService: { list: mocks.locations } } });
const page = (search: Record<string, string | string[]> = {}) => VarianceReportPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });
const table = () => within(screen.getByRole("table", { name: en.varianceReport.label }));
const rows = () => table().getAllByRole("row").filter((node) => node.parentElement!.closest("table")!.getAttribute("aria-label") === en.varianceReport.label).slice(1);
const figures = (node: HTMLElement) => [...node.querySelectorAll("[data-report-output]")[0].querySelectorAll("dt, dd")].map((cell) => cell.textContent);
const componentCells = (node: HTMLElement, material: string) => [...node.querySelector(`[data-report-component="${material}"]`)!.querySelectorAll("td")].map((cell) => cell.textContent);

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ role: "user" });
  mocks.tenantScope.mockResolvedValue(scope());
  mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  mocks.materials.mockResolvedValue([bar, milk]);
  mocks.locations.mockResolvedValue([plant, depot]);
  mocks.read.mockResolvedValue(report());
});
afterEach(() => vi.clearAllMocks());

describe("VarianceReportPage", () => {
  it("shows each order's target against what it produced, and each component's expected, actual, variance and waste (PRD-013, PRD-015)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.read).toHaveBeenCalledWith({});
    expect(screen.getByRole("heading", { name: "Variance report — Test" })).toBeTruthy();
    expect(screen.getByText(/as of 2026-10-21 \(UTC\)/)).toBeTruthy();
    expect(screen.getByText("Orders: 2")).toBeTruthy();
    const [first] = rows();
    expect(within(first).getByRole("link", { name: "Production order 00000001" }).getAttribute("href")).toBe("/admin/test/production-orders/00000001");
    expect(within(first).getByText("00000001 — Chocolate bar")).toBeTruthy();
    expect(within(first).getByText("00000001 — Main plant")).toBeTruthy();
    expect(within(first).getByText("Completed")).toBeTruthy();
    expect(within(first).getByText("BOM 00000003 rev. 2")).toBeTruthy();
    expect(figures(first)).toEqual(["Target", "40 each", "Produced", "40 each", "Output variance", "0 each", "Completions", "1", "Waste postings", "0"]);
    const components = within(first).getByRole("table", { name: "Components of production order 00000001" });
    expect(within(components).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Material", "Expected", "Actual", "Variance", "Waste"]);
    expect(componentCells(first, "00000002")).toEqual(["00000002 Cocoa mass", "20 kg", "18 kg", "-2 kg", "0 kg"]);
    expect(componentCells(first, "00000004")).toEqual(["00000004 Milk powder Extra", "0 kg", "2 kg", "+2 kg", "0 kg"]);
    // Phones get the same figures stacked under the order, each named.
    expect([...first.querySelector("[data-report-stacked='00000004']")!.querySelectorAll("span, dt, dd")].map((node) => node.textContent)).toEqual([
      "00000004 Milk powder Extra", "Extra", "Expected", "0 kg", "Actual", "2 kg", "Variance", "+2 kg", "Waste", "0 kg",
    ]);
    expect(first.querySelector("[data-report-reversed]")).toBeNull();
    expect(screen.queryByRole("navigation", { name: en.varianceReport.pagination })).toBeNull();
    expect(screen.queryByText(en.varianceReport.partial, { exact: false })).toBeNull();
  });

  it("marks waste postings and lists reversed completions, which are not counted (PRD-018, REV-014)", async () => {
    render(await resolveServerComponents(page()));

    const [, second] = rows();
    expect(figures(second)).toEqual(["Target", "100 each", "Produced", "40 each", "Output variance", "-60 each", "Completions", "2", "Waste postings", "1Waste"]);
    // The reversed completions are their own line, not a value of Waste postings.
    expect(second.querySelector("[data-report-reversed]")!.tagName).toBe("P");
    expect(second.querySelector("[data-report-reversed]")!.textContent).toBe("Reversed: 00000007, 00000009");
    expect(componentCells(second, "00000002")).toEqual(["00000002 Cocoa mass", "20 kg", "30 kg", "+10 kg", "10 kg"]);
  });

  it("says when nothing is counted, and shows no output variance under a date range", async () => {
    mocks.read.mockResolvedValue(report({ total: 1, rows: [row({ produced: "0.000000", outputVariance: null, completions: 0, reversed: ["00000003"], components: [] })] }));

    render(await resolveServerComponents(page({ to: "2026-10-31" })));

    const [only] = rows();
    expect(figures(only)).toContain("—");
    // Once in the components column, once stacked for phones.
    expect(within(only).getAllByText(en.varianceReport.noComponents)).toHaveLength(2);
    expect(screen.getByText(`Orders: 1 ${en.varianceReport.partial}`)).toBeTruthy();
  });

  it("offers every material, location and state as a filter, with All and empty dates", async () => {
    render(await resolveServerComponents(page()));

    const material = screen.getByLabelText("Material") as HTMLSelectElement;
    expect(material.name).toBe("material");
    expect([...material.options].map((option) => option.textContent)).toEqual(["All", "00000001 — Chocolate bar", "00000004 — Milk powder (Inactive)"]);
    expect([...(screen.getByLabelText("Location") as HTMLSelectElement).options].map((option) => option.textContent)).toEqual(["All", "00000001 — Main plant", "00000002 — Depot (Inactive)"]);
    const state = screen.getByLabelText("State") as HTMLSelectElement;
    expect(state.name).toBe("status");
    expect([...state.options].map((option) => [option.value, option.textContent])).toEqual([
      ["", "All"], ["open", "Open"], ["completed", "Completed"], ["closed-early", "Closed Early"], ["cancelled", "Cancelled"],
    ]);
    for (const [label, name] of [["From", "from"], ["To", "to"]]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect([input.name, input.type, input.value]).toEqual([name, "date", ""]);
    }
    expect(screen.getByLabelText("To").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("button", { name: "Apply" }).closest("form")!.getAttribute("action")).toBe("/admin/test/reports/variance");
  });

  it("keeps the chosen filters in the form and the page links, and shows the last page for one past the end", async () => {
    mocks.read.mockImplementation(async (query: { page?: string }) => report({ page: Number(query.page), total: 120 }));
    const search = { material: "00000001", location: "00000002", status: "open", from: "2026-10-01", to: "2026-10-31", page: "9" };

    render(await resolveServerComponents(page(search)));

    expect(mocks.read).toHaveBeenNthCalledWith(1, search);
    expect(mocks.read).toHaveBeenNthCalledWith(2, { ...search, page: "3" });
    expect((screen.getByLabelText("Material") as HTMLSelectElement).value).toBe("00000001");
    expect((screen.getByLabelText("Location") as HTMLSelectElement).value).toBe("00000002");
    expect((screen.getByLabelText("State") as HTMLSelectElement).value).toBe("open");
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-10-01");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-10-31");
    const pages = within(screen.getByRole("navigation", { name: en.varianceReport.pagination }));
    expect(pages.getByText("Page 3 of 3")).toBeTruthy();
    expect(pages.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe(
      "/admin/test/reports/variance?material=00000001&location=00000002&status=open&from=2026-10-01&to=2026-10-31&page=2",
    );
  });

  it("links the next page without filters it doesn't have", async () => {
    mocks.read.mockResolvedValue(report({ total: 51 }));
    render(await resolveServerComponents(page()));
    expect(within(screen.getByRole("navigation", { name: en.varianceReport.pagination })).getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/admin/test/reports/variance?page=2",
    );
  });

  it("keeps the form and shows the error beside To for a range that ends before it starts, reading nothing", async () => {
    render(await resolveServerComponents(page({ material: "00000001", from: "2026-10-22", to: "2026-10-21" })));

    expect(mocks.read).not.toHaveBeenCalled();
    const to = screen.getByLabelText("To") as HTMLInputElement;
    expect(to.value).toBe("2026-10-21");
    expect(to.getAttribute("aria-invalid")).toBe("true");
    const error = document.getElementById(to.getAttribute("aria-describedby")!)!;
    expect(error.textContent).toBe(en.varianceReport.rangeError);
    // Rendered with the page, so it takes focus: an alert already in the page at load isn't announced by every screen reader.
    expect(document.activeElement).toBe(error);
    expect(error.getAttribute("role")).toBe("alert");
    expect((screen.getByLabelText("Material") as HTMLSelectElement).value).toBe("00000001");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/as of \d{4}-\d{2}-\d{2} \(UTC\)/)).toBeTruthy();
  });

  it("says when nothing matches, and reads a read-only tenant in Polish the same way (TEN-018)", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.read.mockResolvedValue(report({ total: 0, rows: [] }));

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { name: "Raport odchyleń — Test" })).toBeTruthy();
    expect(screen.getByText(pl.varianceReport.empty)).toBeTruthy();
    expect(screen.getByText("Zleceń: 0")).toBeTruthy();
  });

  it("renders not found for a malformed query, a filter the tenant doesn't have, or a missing tenant", async () => {
    await expect(resolveServerComponents(page({ page: "0" }))).rejects.toThrow("404");
    await expect(resolveServerComponents(page({ state: "open" }))).rejects.toThrow("404");
    await expect(resolveServerComponents(page({ from: "2026-02-30" }))).rejects.toThrow("404");
    mocks.read.mockRejectedValueOnce(new AppError("MATERIAL_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page({ material: "00000009" }))).rejects.toThrow("404");
    mocks.tenantScope.mockRejectedValue(new AppError("TENANT_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
