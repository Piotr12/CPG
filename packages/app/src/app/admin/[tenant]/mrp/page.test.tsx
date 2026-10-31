import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type MrpLatestView, type MrpPlanView, type MrpRunView } from "@cpg/core";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import MrpPage from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(), requireUser: vi.fn(), tenantScope: vi.fn(), getMessages: vi.fn(), latest: vi.fn(), runMrp: vi.fn(), materials: vi.fn(), locations: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ runMrp: mocks.runMrp }));

const run: MrpRunView = {
  id: "00000004", createdAt: new Date("2026-10-27T07:12:45.000Z"), account: "anna", channel: "ui", mode: "manual", generation: 3,
  startDate: "2026-10-27", endDate: "2027-01-24", horizonDays: 90, pairs: 30,
};
const zero = "0.000000";
const plan: MrpPlanView = {
  material: "00000012", materialDescription: "Steel sheet", materialActive: true, baseUnit: "kg",
  location: "00000003", locationName: "Main plant", locationActive: true, lowestProjectedBefore: "25.000000", firstShortageDate: null,
  buckets: [{ date: "2026-10-27", firmDemand: zero, forecastDemand: zero, dependentDemand: zero, transferOut: zero, tentativeSupply: zero, dependableSupply: zero,
    atRiskSupply: zero, transferIn: zero, proposedReceipts: zero, safetyTarget: zero, projectedBefore: "25.000000", projectedAfter: "25.000000", shortage: zero }],
};
const report = (overrides: Partial<MrpLatestView> = {}): MrpLatestView => ({ run, page: 1, pageSize: 25, total: 30, plans: [plan], ...overrides });
const steel = { id: "00000012", type: "raw", description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 };
const plant = { id: "00000003", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const scope = (readOnly = false) => ({
  cradle: {
    tenant: { code: "test", name: "Test", generation: 3, readOnly },
    mrpRunService: { latest: mocks.latest }, materialService: { list: mocks.materials }, locationService: { list: mocks.locations },
  },
});
const page = (search: Record<string, string | string[]> = {}) => MrpPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });
const field = (key: string) => document.querySelector(`[data-mrp-field="${key}"]`)?.textContent;
const noRun = () => new AppError("MRP_RUN_NOT_FOUND", "No MRP run exists in this tenant yet.", 404);

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ role: "user" });
  mocks.tenantScope.mockResolvedValue(scope());
  mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  mocks.latest.mockResolvedValue(report());
  mocks.materials.mockResolvedValue([steel]);
  mocks.locations.mockResolvedValue([plant]);
  mocks.runMrp.mockResolvedValue({ ok: true, data: run });
});
afterEach(() => vi.clearAllMocks());

describe("MrpPage", () => {
  it("shows the latest run's ID, time and account, its report, and offers Run MRP bound to the tenant and generation (RUN-002)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.latest).toHaveBeenCalledWith({});
    expect(screen.getByRole("heading", { level: 1, name: "MRP — Test" })).toBeTruthy();
    expect(field("id")).toBe("00000004");
    expect(field("time")).toBe("2026-10-27 07:12 UTC");
    expect(field("account")).toBe("anna · UI");
    expect(field("days")).toBe("2026-10-27 – 2027-01-24 (90 days)");
    expect(field("pairs")).toBe("30");
    expect(screen.getByRole("heading", { level: 2, name: en.mrp.report.heading })).toBeTruthy();
    expect(within(screen.getByRole("table", { name: en.mrp.report.label })).getByText("00000012 — Steel sheet")).toBeTruthy();
    screen.getByRole("button", { name: en.mrp.run }).click();
    await vi.waitFor(() => expect(mocks.runMrp).toHaveBeenCalledWith("test", 3));
  });

  it("reads the report with the page's filters, keeps them in the form, and shows the last page for one past the end", async () => {
    mocks.latest.mockImplementation(async (query: { page?: string }) => report({ page: Number(query.page), total: 60 }));
    const search = { material: "00000012", location: "00000003", page: "9" };

    render(await resolveServerComponents(page(search)));

    expect(mocks.latest).toHaveBeenNthCalledWith(1, search);
    expect(mocks.latest).toHaveBeenNthCalledWith(2, { ...search, page: "3" });
    expect((document.querySelector("form [name=material]") as HTMLInputElement | null)?.value ?? "").toBe("00000012");
    const pages = within(screen.getByRole("navigation", { name: en.mrp.report.pagination }));
    expect(pages.getByText("Page 3 of 3")).toBeTruthy();
  });

  it("keeps the latest run and its report readable in a read-only tenant, without Run MRP (RUN-021, TEN-019, TEN-018)", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));

    render(await resolveServerComponents(page()));

    expect(field("id")).toBe("00000004");
    expect(screen.getByRole("table", { name: en.mrp.report.label })).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.mrp.run })).toBeNull();
  });

  it("says no run exists yet, with no report, and how to make one only where one can be made", async () => {
    mocks.latest.mockRejectedValue(noRun());
    render(await resolveServerComponents(page()));
    expect(screen.getByText(en.mrp.empty)).toBeTruthy();
    expect(screen.getByText(en.mrp.emptyWritable)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: en.mrp.report.heading })).toBeNull();
    // No report, no filters: the pickers' lists aren't read.
    expect(mocks.materials).not.toHaveBeenCalled();
    expect(mocks.locations).not.toHaveBeenCalled();

    mocks.tenantScope.mockResolvedValue(scope(true));
    document.body.innerHTML = "";
    render(await resolveServerComponents(page()));
    expect(screen.getByText(en.mrp.empty)).toBeTruthy();
    expect(screen.queryByText(en.mrp.emptyWritable)).toBeNull();
  });

  it("speaks Polish to a Polish reader, an API run included", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.latest.mockResolvedValue(report({ run: { ...run, account: "bot", channel: "api" } }));

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { level: 1, name: "MRP — Test" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("button", { name: pl.mrp.run })).toBeTruthy();
    expect(field("account")).toBe("bot · API");
    expect(field("days")).toBe("2026-10-27 – 2027-01-24 (90 dni)");
    expect(field("time")).toBe("2026-10-27 07:12 UTC");
    expect(screen.getByRole("heading", { level: 2, name: pl.mrp.report.heading })).toBeTruthy();
  });

  it("renders not found for a malformed query, a page-only parameter of the API, a filter the tenant doesn't have, or a missing tenant", async () => {
    await expect(resolveServerComponents(page({ page: "0" }))).rejects.toThrow("404");
    await expect(resolveServerComponents(page({ run: "00000004" }))).rejects.toThrow("404");
    await expect(resolveServerComponents(page({ includeZero: "true" }))).rejects.toThrow("404");
    expect(mocks.latest).not.toHaveBeenCalled();
    mocks.latest.mockRejectedValueOnce(new AppError("MATERIAL_NOT_FOUND", "missing", 404));
    await expect(resolveServerComponents(page({ material: "00000099" }))).rejects.toThrow("404");
    mocks.latest.mockRejectedValueOnce(new AppError("LOCATION_NOT_FOUND", "missing", 404));
    await expect(resolveServerComponents(page({ location: "00000099" }))).rejects.toThrow("404");
    mocks.tenantScope.mockRejectedValue(new AppError("TENANT_NOT_FOUND", "Unknown tenant.", 404));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });

  it("lets any other failure of the read through rather than calling it no run", async () => {
    mocks.latest.mockRejectedValue(new Error("disk I/O error"));

    await expect(resolveServerComponents(page())).rejects.toThrow("disk I/O error");
  });
});
