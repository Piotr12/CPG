import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import PurchaseOrdersPage from "./page";

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
    orders: vi.fn(),
    count: vi.fn(),
    suppliers: vi.fn(),
    locations: vi.fn(),
    materials: vi.fn(),
    units: vi.fn(),
    requisitions: vi.fn(),
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
vi.mock("./actions", () => ({ createOrder: vi.fn() }));

const record = (id: string, name: string, active = true) => ({ id, name, active, createdAt: new Date(), version: 1 });
const SUPPLIERS = [record("00000001", "Steel Service"), record("00000002", "Gone Ltd", false)];
const LOCATIONS = [record("00000001", "Main plant")];
const MATERIALS = [{ id: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 }];
const line = (number: number) => ({
  line: number,
  material: "00000001",
  quantity: "60.000000",
  enteredQuantity: "60",
  enteredUnit: "kg",
  numerator: "1",
  denominator: "1",
  plannedDate: "2027-03-04",
  requisition: null,
});
const order = (id: string, supplier: string, lines: number) => ({
  id,
  supplier,
  location: "00000001",
  status: "open",
  lines: Array.from({ length: lines }, (_, index) => line(index + 1)),
  createdAt: new Date(),
  version: 1,
});
const tenant = (readOnly = false) => ({ code: "test", name: "Test", generation: 1, readOnly });
const page = (search: Record<string, string> = {}) => PurchaseOrdersPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });
const scope = (readOnly = false) => ({
  cradle: {
    tenant: tenant(readOnly),
    purchaseOrderService: { list: mocks.orders, count: mocks.count },
    supplierService: { list: mocks.suppliers },
    locationService: { list: mocks.locations },
    materialService: { list: mocks.materials, listUnits: mocks.units },
    purchaseRequisitionService: { list: mocks.requisitions },
  },
});

describe("PurchaseOrdersPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.count.mockResolvedValue(2);
    mocks.orders.mockResolvedValue([order("00000001", "00000001", 2), order("00000002", "00000002", 1)]);
    mocks.suppliers.mockResolvedValue(SUPPLIERS);
    mocks.locations.mockResolvedValue(LOCATIONS);
    mocks.materials.mockResolvedValue(MATERIALS);
    mocks.units.mockResolvedValue({ "00000001": ["kg"] });
    mocks.requisitions.mockResolvedValue([]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the tenant's orders with supplier, location and line count, and offers any user Create purchase order (LFC-001)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Purchase orders — Test");
    const rows = within(screen.getByRole("table", { name: "Purchase orders" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["00000001", "00000001Steel Service", "00000001Main plant", "2 lines", "Open"],
      ["00000002", "00000002Gone LtdInactive", "00000001Main plant", "1 line", "Open"],
    ]);
    expect(screen.getByRole("link", { name: "00000001" }).getAttribute("href")).toBe("/admin/test/purchase-orders/00000001");
    expect(screen.getByRole("button", { name: "Create purchase order" })).toBeTruthy();
  });

  it("shows the list in Polish, and the empty state with how to start", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.orders.mockResolvedValue([]);

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Zamówienia zakupu — Test");
    expect(screen.getByText(/Brak zamówień zakupu w Test\. Utwórz pierwsze/)).toBeTruthy();
  });

  it("gives no Create purchase order while the tenant is read-only, and says how to start only when it can (R05)", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));
    mocks.orders.mockResolvedValue([]);

    render(await resolveServerComponents(page()));

    expect(screen.getByText("No purchase orders in Test yet.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pages by 100: links to the neighbouring pages, reads the asked page, and shows no links for a single page", async () => {
    const { unmount } = render(await resolveServerComponents(page()));
    expect(screen.queryByRole("navigation", { name: "Purchase order pages" })).toBeNull();
    unmount();

    mocks.count.mockResolvedValue(250);
    render(await resolveServerComponents(page({ page: "2" })));

    expect(mocks.orders).toHaveBeenLastCalledWith(2);
    const nav = screen.getByRole("navigation", { name: "Purchase order pages" });
    expect(nav.textContent).toContain("Page 2 of 3");
    expect(within(nav).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/purchase-orders?page=1");
    expect(within(nav).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/purchase-orders?page=3");
  });

  it("shows the last page for a page past it, and the first page of an empty tenant", async () => {
    mocks.count.mockResolvedValue(250);
    render(await resolveServerComponents(page({ page: "9" })));
    expect(mocks.orders).toHaveBeenLastCalledWith(3);
    expect(screen.getByRole("navigation", { name: "Purchase order pages" }).textContent).toContain("Page 3 of 3");
    cleanup();

    mocks.count.mockResolvedValue(0);
    mocks.orders.mockResolvedValue([]);
    render(await resolveServerComponents(page({ page: "4" })));
    expect(mocks.orders).toHaveBeenLastCalledWith(1);
  });

  it("renders not-found for an invalid page", async () => {
    for (const bad of ["0", "x", "1.5"]) await expect(resolveServerComponents(page({ page: bad }))).rejects.toThrow("404");
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it("renders not-found for an unknown tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
