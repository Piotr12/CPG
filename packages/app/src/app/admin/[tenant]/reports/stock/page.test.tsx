import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type StockReportRow, type StockReportView } from "@cpg/core";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { en } from "../../../../../i18n/messages/en";
import { pl } from "../../../../../i18n/messages/pl";
import StockReportPage from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), requireUser: vi.fn(), tenantScope: vi.fn(), getMessages: vi.fn(), read: vi.fn(), materials: vi.fn(), locations: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const steel = { id: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 };
const bolt = { ...steel, id: "00000002", description: "Bolt M8", baseUnit: "each", active: false };
const plant = { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const depot = { ...plant, id: "00000002", name: "Depot", active: false };
const row = (overrides: Partial<StockReportRow> = {}): StockReportRow => ({
  material: "00000001", materialDescription: "Steel sheet", materialActive: true, baseUnit: "kg",
  location: "00000001", locationName: "Main plant", locationActive: true,
  quantity: "70.000000", inTransitFrom: "30.000000", inTransitTo: "0.000000", ...overrides,
});
const report = (overrides: Partial<StockReportView> = {}): StockReportView => ({ asOf: "2026-10-21", page: 1, pageSize: 100, total: 2, rows: [
  row(),
  row({ material: "00000002", materialDescription: "Bolt M8", materialActive: false, baseUnit: "each", location: "00000002", locationName: "Depot", locationActive: false, quantity: "0.000000", inTransitFrom: "0.000000", inTransitTo: "12.500000" }),
], ...overrides });
const scope = (readOnly = false) => ({ cradle: { tenant: { ...tenant, readOnly }, stockReportService: { read: mocks.read }, materialService: { list: mocks.materials }, locationService: { list: mocks.locations } } });
const page = (search: Record<string, string | string[]> = {}) => StockReportPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });
const table = () => within(screen.getByRole("table", { name: en.stockReport.label }));

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ role: "user" });
  mocks.tenantScope.mockResolvedValue(scope());
  mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  mocks.materials.mockResolvedValue([steel, bolt]);
  mocks.locations.mockResolvedValue([plant, depot]);
  mocks.read.mockResolvedValue(report());
});
afterEach(() => vi.clearAllMocks());

/** A filter autocomplete's offered choices, read from its list (named by the field's label) while open. */
function choices(name: string) {
  const field = screen.getByRole("combobox", { name });
  fireEvent.focus(field);
  const offered = within(screen.getByRole("listbox", { name })).getAllByRole("option").map((option) => option.textContent);
  fireEvent.keyDown(field, { key: "Escape" });
  return offered;
}
const chosen = (name: string) => (screen.getByRole("combobox", { name }) as HTMLInputElement).value;

describe("StockReportPage", () => {
  it("shows on hand and in transit out and in apart, each row opening its pair's ledger (UX-017, INV-012)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.read).toHaveBeenCalledWith({});
    expect(screen.getByRole("heading", { name: "Stock report — Test" })).toBeTruthy();
    expect(screen.getByText(/as of 2026-10-21 \(UTC\)/)).toBeTruthy();
    expect(screen.getByText("Rows: 2")).toBeTruthy();
    const [first, second] = table().getAllByRole("row").slice(1);
    expect(within(first).getByText("00000001 — Steel sheet")).toBeTruthy();
    expect(first.querySelector("[data-report-on-hand]")!.textContent).toBe("70 kg");
    expect(first.querySelector("[data-report-transit-from]")!.textContent).toBe("30 kg");
    expect(first.querySelector("[data-report-transit-to]")!.textContent).toBe("0 kg");
    expect(within(second).getByText("00000002 — Bolt M8 (Inactive)")).toBeTruthy();
    // The location has its own column, and repeats under the material for narrow screens.
    expect(within(second).getAllByText("00000002 — Depot (Inactive)")).toHaveLength(2);
    expect(second.querySelector("[data-report-transit-to]")!.textContent).toBe("12.5 each");
    // Narrow screens stack the three figures, each named, in one cell.
    expect([...second.querySelectorAll("dl dt, dl dd")].map((node) => node.textContent)).toEqual([
      "On hand", "0 each", "In transit out", "0 each", "In transit in", "12.5 each",
    ]);
    expect(table().getByRole("link", { name: "Ledger of 00000001 Steel sheet at 00000001 Main plant" }).getAttribute("href")).toBe(
      "/admin/test/stock?material=00000001&location=00000001",
    );
    expect(screen.queryByRole("navigation", { name: en.stockReport.pagination })).toBeNull();
  });

  it("offers every material and location as a filter, with All and the zero toggle unset", async () => {
    render(await resolveServerComponents(page()));

    const material = screen.getByRole("combobox", { name: "Material" }) as HTMLInputElement;
    expect([material.value, material.placeholder]).toEqual(["", "All"]);
    expect(choices("Material")).toEqual(["00000001—Steel sheet", "00000002—Bolt M8Inactive"]);
    expect(choices("Location")).toHaveLength(2);
    expect(Object.fromEntries(new FormData(material.form!))).toEqual({ material: "", location: "" });
    expect(screen.getByRole("checkbox", { name: en.stockReport.includeZero }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: "Apply" }).closest("form")!.getAttribute("action")).toBe("/admin/test/reports/stock");
  });

  it("keeps the chosen filters in the form and the page links, and shows the last page for one past the end", async () => {
    mocks.read.mockImplementation(async (query: { page?: string }) => report({ page: Number(query.page), total: 250 }));
    const search = { material: "00000001", location: "00000002", includeZero: "true", page: "9" };

    render(await resolveServerComponents(page(search)));

    expect(mocks.read).toHaveBeenNthCalledWith(1, search);
    expect(mocks.read).toHaveBeenNthCalledWith(2, { ...search, page: "3" });
    expect(chosen("Material")).toBe("00000001 — Steel sheet");
    expect(chosen("Location")).toMatch(/^00000002 — /);
    expect(screen.getByRole("checkbox", { name: en.stockReport.includeZero }).getAttribute("aria-checked")).toBe("true");
    const pages = within(screen.getByRole("navigation", { name: en.stockReport.pagination }));
    expect(pages.getByText("Page 3 of 3")).toBeTruthy();
    expect(pages.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/reports/stock?material=00000001&location=00000002&includeZero=true&page=2");
  });

  it("links the next page without filters it doesn't have", async () => {
    mocks.read.mockResolvedValue(report({ total: 101 }));
    render(await resolveServerComponents(page()));
    expect(within(screen.getByRole("navigation", { name: en.stockReport.pagination })).getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/admin/test/reports/stock?page=2",
    );
  });

  it("says when nothing matches, and reads a read-only tenant in Polish the same way (TEN-018)", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.read.mockResolvedValue(report({ total: 0, rows: [] }));

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { name: "Raport zapasu — Test" })).toBeTruthy();
    expect(screen.getByText(pl.stockReport.empty)).toBeTruthy();
    expect(screen.getByText("Wierszy: 0")).toBeTruthy();
  });

  it("renders not found for a malformed query, a filter the tenant doesn't have, or a missing tenant", async () => {
    await expect(resolveServerComponents(page({ page: "0" }))).rejects.toThrow("404");
    await expect(resolveServerComponents(page({ materials: "00000001" }))).rejects.toThrow("404");
    mocks.read.mockRejectedValueOnce(new AppError("LOCATION_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page({ location: "00000009" }))).rejects.toThrow("404");
    mocks.tenantScope.mockRejectedValue(new AppError("TENANT_NOT_FOUND", "missing"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
