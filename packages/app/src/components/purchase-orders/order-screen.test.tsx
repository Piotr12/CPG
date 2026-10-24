import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OrderView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { OrderScreen } from "./order-screen";
import { OrdersScreen } from "./orders-screen";

vi.mock("../../app/admin/[tenant]/purchase-orders/[id]/actions", () => ({ cancelPurchaseOrder: vi.fn(), closeEarlyPurchaseOrder: vi.fn(), postReceipt: vi.fn(), setPurchaseOrderLineDate: vi.fn() }));
vi.mock("../../app/admin/[tenant]/purchase-orders/actions", () => ({ createPurchaseOrder: vi.fn() }));

const material = { id: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each", active: true, createdAt: new Date(), version: 1 } as const;
const supplier = { id: "00000001", name: "Steel Service", active: true, createdAt: new Date(), version: 1 };
const location = { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const line = { line: 1, material: material.id, quantity: "10.000000", enteredQuantity: "10", enteredUnit: "each", numerator: "1", denominator: "1", plannedDate: "2027-03-05", requisition: null,
  abandoned: "0.000000", received: "4.000000", outstanding: "6.000000", status: "open", posted: true } as const;
const order = { id: "00000001", supplier: supplier.id, location: location.id, status: "open", lines: [line], createdAt: new Date("2027-02-01T10:00:00Z"), version: 1 } as unknown as OrderView;
const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const detail = { tenant, order, receipts: [], materials: [material], units: {}, suppliers: [supplier], locations: [location], locale: "en" as const, messages: en };
const header = () => screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
const tone = (scope: HTMLElement, label: string) => within(scope).getByText(label).closest("[data-slot=status-badge]")?.getAttribute("data-tone");

describe("OrderScreen", () => {
  it("heads the order with its status badge and Close order early… after the primary actions, and badges every line", () => {
    render(<OrderScreen {...detail} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Purchase order 00000001 — Steel Service");
    expect(tone(header(), "Open")).toBe("neutral");
    const close = within(header()).getByRole("button", { name: "Close order early… — Purchase orders 00000001" });
    expect(close.getAttribute("data-variant")).toBe("destructive");
    expect(screen.getByRole("link", { name: "All purchase orders" }).getAttribute("href")).toBe("/admin/test/purchase-orders");
    const table = screen.getByRole("table", { name: en.purchaseOrders.lines.heading });
    const cells = within(table).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["1", "00000002Bolt M8", "10 each", "", "2027-03-05", "—", "4 each", "6 each", "Open", "0 each", "Change dateClose line early…"]);
    expect(tone(cells[8], "Open")).toBe("neutral");
    expect(cells[2].className).toContain("text-right"); expect(cells[3].className).toContain("hidden md:table-cell");
    expect(within(cells[10]).getByRole("button", { name: "Close line early… — Purchase orders 00000001 — Line 1" })).toBeTruthy();
  });

  it("reads Received in the success tone and offers no header action on a finished order or a read-only tenant", () => {
    const received = { ...order, status: "completed", lines: [{ ...line, status: "completed", received: "10.000000", outstanding: "0.000000" }] } as unknown as OrderView;
    const { rerender } = render(<OrderScreen {...detail} order={received} />);
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(tone(header(), "Completed")).toBe("success");
    const status = within(screen.getByRole("table", { name: en.purchaseOrders.lines.heading })).getAllByRole("cell")[8];
    expect(status.textContent).toBe("Received"); expect(tone(status, "Received")).toBe("success");
    rerender(<OrderScreen {...detail} tenant={{ ...tenant, readOnly: true }} messages={pl} locale="pl" order={{ ...order, status: "cancelled" } as unknown as OrderView} />);
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(within(header()).getByText(pl.purchaseOrders.status.cancelled).closest("[data-slot=status-badge]")?.querySelector("svg.lucide-circle-x")).toBeTruthy();
  });
});

describe("OrdersScreen", () => {
  const list = { tenant, orders: [order], page: 1, pages: 1, suppliers: [supplier], locations: [location], materials: [material], units: {}, requisitions: [], locale: "en" as const, messages: en };

  it("heads the list with its intro and Create purchase order, and badges each status and an inactive supplier", () => {
    render(<OrdersScreen {...list} suppliers={[{ ...supplier, active: false }]} orders={[order, { ...order, id: "00000002", status: "closed-early" } as unknown as OrderView]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Purchase orders — Test");
    expect(within(header()).getByText(en.purchaseOrders.intro)).toBeTruthy();
    expect(within(header()).getByRole("button", { name: en.purchaseOrders.create.open })).toBeTruthy();
    const table = screen.getByRole("table", { name: en.purchaseOrders.link });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(tone(rows[0], "Open")).toBe("neutral");
    expect(tone(rows[1], "Closed Early")).toBe("warning");
    const inactive = within(rows[0]).getByText(en.purchaseOrders.inactive).closest("[data-slot=status-badge]")!;
    expect(inactive.getAttribute("data-tone")).toBe("neutral"); expect(inactive.className).toContain("border-dashed");
    const cells = within(rows[0]).getAllByRole("cell");
    expect(cells[0].className).toContain("font-mono"); expect(cells[2].className).toContain("hidden md:table-cell"); expect(cells[3].className).toContain("hidden md:table-cell");
  });

  it("offers no create action in a read-only tenant", () => {
    render(<OrdersScreen {...list} tenant={{ ...tenant, readOnly: true }} />);
    expect(within(header()).queryByRole("button")).toBeNull();
  });
});
