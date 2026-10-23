import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import { customers, locations, materials, order, tenant } from "../../../../../tests/setup/customer-orders";
import CustomerOrdersPage from "../../app/admin/[tenant]/customer-orders/page";
import CustomerOrderPage from "../../app/admin/[tenant]/customer-orders/[id]/page";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { OrdersScreen } from "./order-screen";

const mocks = vi.hoisted(() => {
  class AppError extends Error { constructor(readonly code: string) { super(code); } }
  return { AppError, connection: vi.fn(), requireUser: vi.fn(), getMessages: vi.fn(), tenantScope: vi.fn(),
    list: vi.fn(), count: vi.fn(), get: vi.fn(), shipments: vi.fn(), materials: vi.fn(), units: vi.fn(), customers: vi.fn(), locations: vi.fn(),
    notFound: vi.fn(() => { throw new Error("404"); }) };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", async (importOriginal) => {
  const { isNothing, outstandingOf } = await importOriginal<typeof import("@cpg/core")>();
  return { AppError: mocks.AppError, tenantScope: mocks.tenantScope, isNothing, outstandingOf };
});
vi.mock("../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../app/admin/[tenant]/customer-orders/actions", () => ({ createCustomerOrder: vi.fn(), updateCustomerOrder: vi.fn() }));
vi.mock("../../app/admin/[tenant]/customer-orders/[id]/actions", () => ({ cancelCustomerOrder: vi.fn(), closeEarlyCustomerOrder: vi.fn(), createShipment: vi.fn() }));
const scope = (readOnly = false) => ({ cradle: { tenant: { ...tenant, readOnly }, customerOrderService: { list: mocks.list, count: mocks.count, get: mocks.get }, shipmentService: { list: mocks.shipments },
  materialService: { list: mocks.materials, listUnits: mocks.units }, customerService: { list: mocks.customers }, locationService: { list: mocks.locations } } });
const page = (detail = false) => detail ? CustomerOrderPage({ params: Promise.resolve({ tenant: "test", id: order.id }), searchParams: Promise.resolve({}) }) :
  CustomerOrdersPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve({}) });
describe("customer order pages", () => {
  beforeEach(() => {
    mocks.tenantScope.mockResolvedValue(scope()); mocks.getMessages.mockResolvedValue({ locale: "en", messages: en }); mocks.requireUser.mockResolvedValue({ role: "user" });
    mocks.count.mockResolvedValue(1); mocks.shipments.mockResolvedValue([]); mocks.list.mockResolvedValue([order]); mocks.get.mockResolvedValue(order); mocks.materials.mockResolvedValue(materials);
    mocks.units.mockResolvedValue({ "00000005": ["each", "case"] }); mocks.customers.mockResolvedValue(customers); mocks.locations.mockResolvedValue(locations);
  });
  afterEach(() => vi.clearAllMocks());
  it("lists dated demand for either role behind request-time authentication", async () => {
    render(await resolveServerComponents(page()));
    expect(mocks.connection).toHaveBeenCalledOnce(); expect(mocks.requireUser).toHaveBeenCalledOnce(); expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Customer orders — Test");
    expect(screen.getByRole("link", { name: "00000001" }).getAttribute("href")).toBe("/admin/test/customer-orders/00000001");
    const cells = within(screen.getByRole("table", { name: "Customer orders" })).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["00000001", "00000001 Customer A", "00000001 Warehouse", "1", "Open"]);
    expect(screen.getByRole("button", { name: "Create order" })).toBeTruthy();
  });
  it("renders bounded page navigation and rejects an invalid page", async () => {
    mocks.count.mockResolvedValue(201);
    const paged = (page: string) => CustomerOrdersPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve({ page }) });
    render(await resolveServerComponents(paged("1")));
    expect(mocks.list).toHaveBeenLastCalledWith(1);
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe("/admin/test/customer-orders?page=2");
    cleanup(); render(await resolveServerComponents(paged("2")));
    expect(screen.getByRole("link", { name: "Previous page" }).getAttribute("href")).toBe("/admin/test/customer-orders?page=1");
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    cleanup(); render(await resolveServerComponents(paged("99")));
    expect(mocks.list).toHaveBeenLastCalledWith(3);
    expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
    await expect(resolveServerComponents(paged("0"))).rejects.toThrow("404");
  });
  it("pages the list in Polish", () => {
    render(<OrdersScreen tenant={tenant} orders={[order]} page={2} total={201} customers={customers} locations={locations} materials={materials} units={{}} locale="pl" messages={pl} />);
    const nav = within(screen.getByRole("navigation", { name: "Strony zamówień klientów" }));
    expect(nav.getByRole("link", { name: "Poprzednia strona" }).getAttribute("href")).toBe("/admin/test/customer-orders?page=1");
    expect(nav.getByRole("link", { name: "Następna strona" }).getAttribute("href")).toBe("/admin/test/customer-orders?page=3");
    expect(nav.getByText("Strona 2 z 3")).toBeTruthy();
  });
  it("shows original entries, exact base quantities, dates and progress on the detail", async () => {
    render(await resolveServerComponents(page(true)));
    expect(mocks.get).toHaveBeenCalledWith(order.id); expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Customer order 00000001");
    expect(screen.getByRole("link", { name: "All customer orders" }).getAttribute("href")).toBe("/admin/test/customer-orders");
    expect(screen.getByRole("link", { name: "00000005 Cabinet" }).getAttribute("href")).toBe("/admin/test/materials/00000005");
    const cells = within(screen.getByRole("table", { name: "Lines" })).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["00000005 Cabinet", "24 each", "2 case (1 case = 12 each)", "2027-01-04", "0", "24", "Open", "0", "Cancel"]);
    expect(screen.getByRole("button", { name: "Edit order" })).toBeTruthy();
    expect(mocks.shipments).toHaveBeenCalledWith({ customerOrder: order.id });
    expect(screen.getByRole("button", { name: "Create shipment" })).toBeTruthy();
    expect(screen.getByText("No shipments yet.")).toBeTruthy();
  });
  it("shows a translated empty state and hides controls in a read-only tenant", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true)); mocks.list.mockResolvedValue([]); mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    render(await resolveServerComponents(page()));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Zamówienia klientów — Test");
    expect(screen.getByText("Brak zamówień klientów.")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
    cleanup(); mocks.tenantScope.mockResolvedValue(scope());
    render(await resolveServerComponents(page())); expect(screen.getByText("Brak zamówień klientów. Utwórz zamówienie, aby zapisać popyt z terminami.")).toBeTruthy();
  });
  it("uses inactive master captions and keeps terminal orders read-only", () => {
    render(<OrdersScreen tenant={tenant} orders={[]} order={{ ...order, status: "completed" }} customers={customers.map((record) => ({ ...record, active: false }))}
      locations={locations.map((record) => ({ ...record, active: false }))} materials={materials.map((record) => ({ ...record, active: false }))} units={{}}
      locale="en" messages={en} />);
    expect(screen.queryByRole("button")).toBeNull(); expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });
  it("lists the order's shipments and offers Create shipment only while a writable order has anything outstanding (SAL-006)", () => {
    const shipment = { id: "00000002", customerOrder: order.id, customer: "00000001", location: "00000001", plannedDate: "2027-01-02", status: "open" as const, version: 1, createdAt: order.createdAt,
      lines: [{ line: 1, orderLine: order.lines[0].id, material: "00000005", quantity: "24.000000", enteredQuantity: "24", enteredUnit: "each", numerator: "1", denominator: "1", issued: "4.000000", posted: true, toIssue: "20.000000" }] };
    const screenOf = (props: Partial<Parameters<typeof OrdersScreen>[0]>) =>
      render(<OrdersScreen tenant={tenant} orders={[]} order={order} shipments={[shipment]} customers={customers} locations={locations} materials={materials} units={{}} locale="en" messages={en} {...props} />);

    screenOf({});
    const cells = within(screen.getByRole("table", { name: "Shipments" })).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["00000002", "2027-01-02", "Open", "Line 1: 4 of 24 each"]);
    expect(screen.getByRole("link", { name: "00000002" }).getAttribute("href")).toBe("/admin/test/shipments/00000002");
    expect(screen.getByRole("button", { name: "Create shipment" })).toBeTruthy();

    cleanup(); screenOf({ order: { ...order, lines: [{ ...order.lines[0], fulfilled: "24.000000", status: "completed" }] } });
    expect(within(screen.getByRole("table", { name: "Lines" })).getAllByRole("cell")[5].textContent).toBe("0");
    expect(screen.queryByRole("button", { name: "Create shipment" })).toBeNull();
    cleanup(); screenOf({ tenant: { ...tenant, readOnly: true } });
    expect(screen.queryByRole("button", { name: "Create shipment" })).toBeNull();
    cleanup(); screenOf({ order: { ...order, status: "closed-early" } });
    expect(screen.queryByRole("button", { name: "Create shipment" })).toBeNull();
  });
  it("returns not-found for an unknown tenant or order", async () => {
    mocks.tenantScope.mockRejectedValueOnce(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
    mocks.get.mockRejectedValueOnce(new mocks.AppError("CUSTOMER_ORDER_NOT_FOUND"));
    await expect(resolveServerComponents(page(true))).rejects.toThrow("404");
  });
});
