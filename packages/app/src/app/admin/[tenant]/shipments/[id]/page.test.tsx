import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { en } from "../../../../../i18n/messages/en";
import { pl } from "../../../../../i18n/messages/pl";
import ShipmentPage from "./page";

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
    order: vi.fn(),
    issues: vi.fn(),
    customers: vi.fn(),
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
vi.mock("@cpg/core", async (importOriginal) => ({
  isNothing: (await importOriginal<typeof import("@cpg/core")>()).isNothing,
  outstandingOf: (await importOriginal<typeof import("@cpg/core")>()).outstandingOf,
  AppError: mocks.AppError,
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ postIssue: vi.fn(), updateShipment: vi.fn(), cancelShipment: vi.fn() }));

const material = (id: string, description: string, baseUnit: string) => ({ id, type: "finished", description, baseUnit, active: true, createdAt: new Date(), version: 1 });
const named = (id: string, name: string) => ({ id, name, active: true, createdAt: new Date(), version: 1 });
const line = (number: number, materialId: string, quantity: string, issued: string, toIssue: string) => ({
  line: number,
  orderLine: `00000000-0000-4000-8000-00000000000${number}`,
  material: materialId,
  quantity,
  enteredQuantity: quantity,
  enteredUnit: "each",
  numerator: "1",
  denominator: "1",
  issued,
  posted: issued !== "0.000000",
  toIssue,
});
const SHIPMENT = {
  id: "00000002",
  customerOrder: "00000007",
  customer: "00000001",
  location: "00000001",
  plannedDate: "2027-01-02",
  status: "open",
  version: 3,
  createdAt: new Date(),
  lines: [line(1, "00000005", "50.000000", "50.000000", "0.000000"), line(2, "00000004", "30.000000", "10.000000", "20.000000")],
};
const orderLine = (number: number, materialId: string, quantity: string, fulfilled: string) => ({
  id: `00000000-0000-4000-8000-00000000000${number}`, material: materialId, quantity, enteredQuantity: quantity, enteredUnit: "each", numerator: "1", denominator: "1",
  requiredDate: "2027-01-02", fulfilled, posted: fulfilled !== "0.000000", abandoned: "0.000000", status: "open",
});
/** The shipment's order: lines 1 and 2 are shipped, line 3 has 12 outstanding and isn't. */
const ORDER = {
  id: "00000007", customer: "00000001", location: "00000001", status: "open", version: 2, createdAt: new Date(), updatedAt: new Date(),
  lines: [orderLine(1, "00000005", "50.000000", "50.000000"), orderLine(2, "00000004", "40.000000", "10.000000"), orderLine(3, "00000005", "12.000000", "0.000000")],
};
const cradle = (readOnly = false) => ({
  tenant: { code: "test", name: "Test", generation: 1, readOnly },
  shipmentService: { get: mocks.get },
  customerOrderService: { get: mocks.order },
  goodsIssueService: { list: mocks.issues },
  customerService: { list: mocks.customers },
  locationService: { list: mocks.locations },
  materialService: { list: mocks.materials, listUnits: mocks.units },
});
const page = (id = "00000002") => ShipmentPage({ params: Promise.resolve({ tenant: "test", id }), searchParams: Promise.resolve({}) });
const cells = (table: string) =>
  within(screen.getByRole("table", { name: table }))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));

describe("ShipmentPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: cradle() });
    mocks.get.mockResolvedValue(SHIPMENT);
    mocks.order.mockResolvedValue(ORDER);
    mocks.issues.mockResolvedValue([
      { id: "00000004", shipment: "00000002", customerOrder: "00000007", location: "00000001", businessDate: "2027-01-03", createdAt: new Date(), lines: [{ movementId: null, reversedBy: null, line: 2, material: "00000004", quantity: "10.000000" }] },
    ]);
    mocks.customers.mockResolvedValue([named("00000001", "Retail")]);
    mocks.locations.mockResolvedValue([named("00000001", "Main plant")]);
    mocks.materials.mockResolvedValue([material("00000005", "Cabinet", "each"), material("00000004", "Panel", "each")]);
    mocks.units.mockResolvedValue({ "00000005": ["each", "case"] });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the shipment's order, customer, location, date and status, and each line's plan, issued and to issue (SAL-006, SAL-011)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Shipment 00000002");
    expect(screen.getByRole("link", { name: "Customer order 00000007" }).getAttribute("href")).toBe("/admin/test/customer-orders/00000007");
    expect(screen.getByRole("link", { name: "00000007" }).getAttribute("href")).toBe("/admin/test/customer-orders/00000007");
    expect(screen.getByText("00000001 Retail")).toBeTruthy();
    expect(screen.getByText("00000001 Main plant")).toBeTruthy();
    expect(screen.getByText("2027-01-02")).toBeTruthy();
    expect(cells("Lines")).toEqual([
      ["1", "00000005 Cabinet", "50 each", "50 each", "0 each"],
      ["2", "00000004 Panel", "30 each", "10 each", "20 each"],
    ]);
    expect(screen.getByRole("link", { name: "00000004 Panel" }).getAttribute("href")).toBe("/admin/test/materials/00000004");
  });

  it("lists the shipment's goods issues and offers Post goods issue for the lines with anything to issue (SAL-010)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.issues).toHaveBeenCalledWith({ shipment: "00000002" });
    expect(cells("Goods issues")).toEqual([["00000004", "2027-01-03", "Line 2: 10 each"]]);
    fireEvent.click(screen.getByRole("button", { name: "Post goods issue" }));
    expect(screen.getByRole("dialog", { name: "Post a goods issue" }).textContent).toContain("Stock falls at 00000001 Main plant");
    expect(screen.queryByLabelText("Quantity issued, Line 1: 00000005 Cabinet")).toBeNull();
    expect(screen.getByLabelText("Quantity issued, Line 2: 00000004 Panel")).toBeTruthy();
    expect(screen.getByText("20 each to issue")).toBeTruthy();
    expect(within(screen.getByLabelText("Unit, Line 2: 00000004 Panel")).getAllByRole("option").map((option) => option.textContent)).toEqual(["each"]);
  });

  it("offers no issue for a Completed shipment or a read-only tenant, and still lists what was issued (R05)", async () => {
    mocks.get.mockResolvedValue({ ...SHIPMENT, status: "completed" });
    const { unmount } = render(await resolveServerComponents(page()));
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Post goods issue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit shipment" })).toBeNull();
    expect(screen.queryByText(en.shipments.cancel.issued)).toBeNull();
    unmount();

    mocks.get.mockResolvedValue(SHIPMENT);
    mocks.issues.mockResolvedValue([]);
    mocks.tenantScope.mockResolvedValue({ cradle: cradle(true) });
    render(await resolveServerComponents(page()));
    expect(screen.queryByRole("button", { name: "Post goods issue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit shipment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel shipment" })).toBeNull();
    expect(screen.getByText(en.goodsIssues.empty)).toBeTruthy();
  });

  it("offers Edit shipment on the stored plan and the order's unshipped lines, and points to editing instead of Cancel once anything was issued (shipment edit spec Q6, Q8)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.order).toHaveBeenCalledWith("00000007");
    expect(screen.queryByRole("button", { name: "Cancel shipment" })).toBeNull();
    expect(screen.getByText(en.shipments.cancel.issued)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit shipment" }));
    const dialog = screen.getByRole("dialog", { name: "Edit shipment 00000002" });
    expect(within(dialog).getByText("Planned 30 each, issued 10 each, at least 10 each")).toBeTruthy();
    expect((within(dialog).getByLabelText("Quantity to ship, Line 1: 00000005 Cabinet") as HTMLInputElement).value).toBe("50.000000");
    expect((within(dialog).getByLabelText("Quantity to ship, Order line 3: 00000005 Cabinet") as HTMLInputElement).value).toBe("");
    expect(within(dialog).getByText("12 each outstanding")).toBeTruthy();
  });

  it("offers Cancel shipment while nothing was ever issued against it", async () => {
    mocks.get.mockResolvedValue({ ...SHIPMENT, lines: [line(1, "00000005", "50.000000", "0.000000", "50.000000")] });
    render(await resolveServerComponents(page()));

    expect(screen.getByRole("button", { name: "Edit shipment" })).toBeTruthy();
    expect(screen.queryByText(en.shipments.cancel.issued)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel shipment" }));
    expect(screen.getByRole("alertdialog", { name: "Cancel shipment 00000002?" })).toBeTruthy();
  });

  it("shows the page in Polish", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Wysyłka 00000002");
    expect(screen.getByRole("button", { name: "Zaksięguj wydanie towaru" })).toBeTruthy();
    expect(document.querySelector("[lang]")?.getAttribute("lang")).toBe("pl");
  });

  it("is the not-found state for an unknown tenant or a shipment this tenant doesn't have (TEN-014)", async () => {
    mocks.tenantScope.mockRejectedValueOnce(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
    mocks.get.mockRejectedValueOnce(new mocks.AppError("SHIPMENT_NOT_FOUND"));
    await expect(resolveServerComponents(page("00000009"))).rejects.toThrow("404");
  });
});

it("shows a visible language-neutral skeleton while request-time content loads", () => {
  const { container } = render(page().props.children.props.fallback);
  expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  expect(container.textContent).toBe("");
});
