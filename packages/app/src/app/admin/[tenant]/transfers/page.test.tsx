import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import TransfersPage from "./page";

const mocks = vi.hoisted(() => {
  class AppError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    AppError,
    connection: vi.fn(),
    getMessages: vi.fn(),
    requireUser: vi.fn(),
    tenantScope: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    locations: vi.fn(),
    materials: vi.fn(),
    units: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ createTransfer: vi.fn() }));

const location = (id: string, name: string, active = true) => ({ id, name, active, createdAt: new Date(), version: 1 });
const TRANSFER = {
  id: "00000001", material: "00000001", source: "00000001", destination: "00000002", quantity: "100.000000", enteredQuantity: "100", enteredUnit: "kg",
  numerator: "1", denominator: "1", plannedDispatch: "2027-03-01", plannedArrival: "2027-03-03", dispatched: "60.000000", received: "50.000000",
  writtenOff: "0.000000", inTransit: "10.000000", undispatched: "40.000000", status: "open", createdAt: new Date(), updatedAt: new Date(), version: 3,
};
const scope = (readOnly = false) => ({
  cradle: {
    tenant: { code: "test", name: "Test", generation: 1, readOnly },
    transferService: { list: mocks.list, count: mocks.count },
    locationService: { list: mocks.locations },
    materialService: { list: mocks.materials, listUnits: mocks.units },
  },
});
const page = (search: Record<string, string> = {}) => TransfersPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });

describe("TransfersPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.list.mockResolvedValue([TRANSFER, { ...TRANSFER, id: "00000002", status: "completed", inTransit: "0.000000" }]);
    mocks.count.mockResolvedValue(2);
    mocks.locations.mockResolvedValue([location("00000001", "Main plant"), location("00000002", "Warehouse"), location("00000003", "Closed depot", false)]);
    mocks.materials.mockResolvedValue([{ id: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 }]);
    mocks.units.mockResolvedValue({ "00000001": ["kg", "t"] });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the tenant's transfers with their route, quantities and status, and offers any user Create transfer (TRF-001)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.list).toHaveBeenCalledWith(1);
    expect(screen.getByRole("heading", { name: "Transfers — Test" })).toBeTruthy();
    const table = within(screen.getByRole("table", { name: "Transfers" }));
    const row = table.getByRole("link", { name: "00000001" }).closest("tr")!;
    expect(table.getByRole("link", { name: "00000001" }).getAttribute("href")).toBe("/admin/test/transfers/00000001");
    expect(within(row).getByText("00000001 Steel sheet")).toBeTruthy();
    expect(within(row).getByText("00000001 Main plant → 00000002 Warehouse")).toBeTruthy();
    expect(within(row).getByText("100 kg")).toBeTruthy();
    expect(within(row).getByText("10 kg")).toBeTruthy();
    expect(within(row).getByText("2027-03-01 → 2027-03-03")).toBeTruthy();
    expect(within(row).getByText("Open")).toBeTruthy();
    expect(table.getByText("Completed")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: en.transfers.pagination })).toBeNull();
    expect(screen.getByRole("button", { name: "Create transfer" })).toBeTruthy();
  });

  it("pages the list, showing the last page for a page past it", async () => {
    mocks.count.mockResolvedValue(250);

    render(await resolveServerComponents(page({ page: "9" })));

    expect(mocks.list).toHaveBeenCalledWith(3);
    const nav = within(screen.getByRole("navigation", { name: en.transfers.pagination }));
    expect(nav.getByText("Page 3 of 3")).toBeTruthy();
    expect(nav.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/transfers?page=2");
    expect(nav.queryByRole("link", { name: "Next" })).toBeNull();
  });

  it("links to the next page from the first", async () => {
    mocks.count.mockResolvedValue(101);

    render(await resolveServerComponents(page()));

    const nav = within(screen.getByRole("navigation", { name: en.transfers.pagination }));
    expect(nav.queryByRole("link", { name: "Previous" })).toBeNull();
    expect(nav.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/transfers?page=2");
  });

  it("pages the list in Polish", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.count.mockResolvedValue(250);

    render(await resolveServerComponents(page({ page: "2" })));

    const nav = within(screen.getByRole("navigation", { name: "Strony przesunięć" }));
    expect(nav.getByText("Strona 2 z 3")).toBeTruthy();
    expect(nav.getByRole("link", { name: "Poprzednia" }).getAttribute("href")).toBe("/admin/test/transfers?page=1");
    expect(nav.getByRole("link", { name: "Następna" }).getAttribute("href")).toBe("/admin/test/transfers?page=3");
  });

  it("shows the empty state in Polish, with how to start only while the tenant is writable (R05)", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.list.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);

    const { unmount } = render(await resolveServerComponents(page()));
    expect(screen.getByText("Brak przesunięć w środowisku Test. Utwórz pierwsze przyciskiem Utwórz przesunięcie.")).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledWith(1);
    unmount();

    mocks.tenantScope.mockResolvedValue(scope(true));
    render(await resolveServerComponents(page()));
    expect(screen.getByText("Brak przesunięć w środowisku Test.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Utwórz przesunięcie" })).toBeNull();
  });

  it("renders not-found for a malformed page and an unknown tenant", async () => {
    await expect(resolveServerComponents(page({ page: "0" }))).rejects.toThrow("404");
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
