import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { en } from "../../../../../i18n/messages/en";
import { pl } from "../../../../../i18n/messages/pl";
import PurchaseOrderPage from "./page";

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
    get: vi.fn(),
    suppliers: vi.fn(),
    locations: vi.fn(),
    materials: vi.fn(),
    units: vi.fn(),
    receipts: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ postReceipt: vi.fn() }));

const material = (id: string, description: string, baseUnit: string) => ({ id, type: "raw", description, baseUnit, active: true, createdAt: new Date(), version: 1 });
const ORDER = {
  id: "00000001",
  supplier: "00000001",
  location: "00000001",
  status: "open",
  lines: [
    { line: 1, material: "00000001", quantity: "500.000000", enteredQuantity: "0.5", enteredUnit: "t", numerator: "1000", denominator: "1", plannedDate: "2027-03-03", requisition: "00000007", received: "530.000000", outstanding: "0.000000", status: "completed" },
    { line: 2, material: "00000002", quantity: "10.000000", enteredQuantity: "10", enteredUnit: "each", numerator: "1", denominator: "1", plannedDate: "2027-03-05", requisition: null, received: "4.000000", outstanding: "6.000000", status: "open" },
  ],
  createdAt: new Date("2027-02-01T10:00:00Z"),
  version: 1,
};
const page = (id = "00000001") => PurchaseOrderPage({ params: Promise.resolve({ tenant: "test", id }), searchParams: Promise.resolve({}) });

describe("PurchaseOrderPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({
      cradle: {
        tenant: { code: "test", name: "Test", generation: 1, readOnly: false },
        purchaseOrderService: { get: mocks.get },
        goodsReceiptService: { list: mocks.receipts },
        supplierService: { list: mocks.suppliers },
        locationService: { list: mocks.locations },
        materialService: { list: mocks.materials, listUnits: mocks.units },
      },
    });
    mocks.get.mockResolvedValue(ORDER);
    mocks.suppliers.mockResolvedValue([{ id: "00000001", name: "Steel Service", active: true, createdAt: new Date(), version: 1 }]);
    mocks.locations.mockResolvedValue([{ id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 }]);
    mocks.materials.mockResolvedValue([material("00000001", "Steel sheet", "kg"), material("00000002", "Bolt M8", "each")]);
    mocks.units.mockResolvedValue({ "00000001": ["kg", "t"], "00000002": ["each"] });
    mocks.receipts.mockResolvedValue([
      { id: "00000003", purchaseOrder: "00000001", location: "00000001", businessDate: "2027-03-02", createdAt: new Date(), lines: [{ movementId: null, reversedBy: null, line: 2, material: "00000002", quantity: "4.000000" }] },
      { id: "00000001", purchaseOrder: "00000001", location: "00000001", businessDate: "2027-03-01", createdAt: new Date(), lines: [{ movementId: null, reversedBy: null, line: 1, material: "00000001", quantity: "530.000000" }] },
    ]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the order's supplier, location and status, and every line with its planned date and requisition (BUY-006, BUY-008)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledWith("00000001");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Purchase order 00000001 — Steel Service");
    expect(screen.getByText("00000001 Steel Service")).toBeTruthy();
    expect(screen.getByText("00000001 Main plant")).toBeTruthy();
    expect(screen.getByText("2027-02-01")).toBeTruthy();
    const rows = within(screen.getByRole("table", { name: "Lines" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["1", "00000001Steel sheet", "500 kg", "0.5 t at 1 t = 1000 kg", "2027-03-03", "00000007", "530 kg", "0 kg", "Received"],
      ["2", "00000002Bolt M8", "10 each", "", "2027-03-05", "—", "4 each", "6 each", "Open"],
    ]);
    expect(screen.getByRole("link", { name: "00000007" }).getAttribute("href")).toBe("/admin/test/purchase-requisitions");
    expect(screen.getByRole("link", { name: "All purchase orders" }).getAttribute("href")).toBe("/admin/test/purchase-orders");
  });

  it("shows the order's goods receipts, newest first, and the Post goods receipt dialog with every line (BUY-010, BUY-015)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.receipts).toHaveBeenCalledWith({ purchaseOrder: "00000001" });
    const rows = within(screen.getByRole("table", { name: "Goods receipts" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["00000003", "2027-03-02", "Line 2: 4 each"],
      ["00000001", "2027-03-01", "Line 1: 530 kg"],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Post goods receipt" }));
    expect(screen.getByLabelText("Quantity received, Line 1: 00000001 Steel sheet")).toBeTruthy();
    expect(screen.getByText("6 each outstanding")).toBeTruthy();
    expect(within(screen.getByLabelText("Unit, Line 1: 00000001 Steel sheet")).getAllByRole("option").map((option) => option.textContent)).toEqual(["kg", "t"]);
  });

  it("offers no receipt for a Completed order or a read-only tenant, and still lists what was received (LFC-008, R05)", async () => {
    mocks.get.mockResolvedValue({ ...ORDER, status: "completed" });
    const { unmount } = render(await resolveServerComponents(page()));
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Post goods receipt" })).toBeNull();
    unmount();

    mocks.get.mockResolvedValue(ORDER);
    mocks.receipts.mockResolvedValue([]);
    mocks.tenantScope.mockResolvedValue({
      cradle: {
        tenant: { code: "test", name: "Test", generation: 1, readOnly: true },
        purchaseOrderService: { get: mocks.get },
        goodsReceiptService: { list: mocks.receipts },
        supplierService: { list: mocks.suppliers },
        locationService: { list: mocks.locations },
        materialService: { list: mocks.materials, listUnits: mocks.units },
      },
    });
    render(await resolveServerComponents(page()));
    expect(screen.queryByRole("button", { name: "Post goods receipt" })).toBeNull();
    expect(screen.getByText(en.goodsReceipts.empty)).toBeTruthy();
  });

  it("shows the page in Polish", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Zamówienie zakupu 00000001 — Steel Service");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Pozycje", "Przyjęcia towaru"]);
  });

  it("renders not-found for an ID this tenant doesn't have, another tenant's included (TEN-014), and for an unknown tenant", async () => {
    mocks.get.mockRejectedValue(new mocks.AppError("PURCHASE_ORDER_NOT_FOUND"));
    await expect(resolveServerComponents(page("00000009"))).rejects.toThrow("404");

    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});

it("shows a visible language-neutral skeleton while request-time content loads", () => {
  const { container } = render(page().props.children.props.fallback);
  expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  expect(container.textContent).toBe("");
});
