import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CustomerOrderView, ShipmentView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { ShipmentScreen } from "./shipment-screen";

vi.mock("../../app/admin/[tenant]/shipments/[id]/actions", () => ({ postIssue: vi.fn(), updateShipment: vi.fn(), cancelShipment: vi.fn() }));

const material = { id: "00000005", type: "finished", description: "Cabinet", baseUnit: "each", active: true, createdAt: new Date(), version: 1 } as const;
const named = { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const shipmentLine = { line: 1, orderLine: "line-1", material: material.id, quantity: "30.000000", enteredQuantity: "30", enteredUnit: "each", numerator: "1", denominator: "1", issued: "0.000000", posted: false, toIssue: "30.000000" };
const shipment: ShipmentView = { id: "00000002", customerOrder: "00000007", customer: "00000001", location: "00000001", plannedDate: "2027-01-02", status: "open", version: 3, createdAt: new Date(), lines: [shipmentLine] };
const order = {
  id: "00000007", customer: "00000001", location: "00000001", status: "open", version: 2, createdAt: new Date(), updatedAt: new Date(),
  lines: [{ id: "line-1", material: material.id, quantity: "30.000000", enteredQuantity: "30", enteredUnit: "each", numerator: "1", denominator: "1", requiredDate: "2027-01-02", fulfilled: "0.000000", posted: false, abandoned: "0.000000", status: "open" }],
} as unknown as CustomerOrderView;
const props = { tenant: { code: "test", name: "Test", generation: 1, readOnly: false }, shipment, order, issues: [], materials: [material], units: {}, customers: [named], locations: [named], locale: "en" as const, messages: en };
const header = () => screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;

describe("ShipmentScreen", () => {
  it("heads the page with the shipment, its status badge and its Edit and Cancel shipment… actions, keeping the link to its order", () => {
    render(<ShipmentScreen {...props} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Shipment 00000002");
    const badge = within(header()).getByText("Open").closest("[data-slot=status-badge]");
    expect(badge?.getAttribute("data-tone")).toBe("neutral"); expect(badge?.querySelector("svg.lucide-circle-dot")).toBeTruthy();
    expect(within(header()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Edit shipment", "Cancel shipment…"]);
    expect(within(header()).getByRole("button", { name: "Cancel shipment…" }).getAttribute("data-variant")).toBe("destructive");
    expect(screen.getByRole("link", { name: "Customer order 00000007" }).getAttribute("href")).toBe("/admin/test/customer-orders/00000007");
    const cells = within(screen.getByRole("table", { name: en.shipments.lines })).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual(["1", "00000005 Cabinet", "30 each", "0 each", "30 each"]);
    expect(cells[0].className).toContain("font-mono"); expect(cells[2].className).toContain("hidden md:table-cell"); expect(cells[4].className).toContain("tabular-nums");
    expect(screen.queryByText(en.shipments.cancel.issued)).toBeNull();
  });

  it("explains why an issued shipment can't be cancelled, and shows a finished one's state without actions", () => {
    const { rerender } = render(<ShipmentScreen {...props} shipment={{ ...shipment, lines: [{ ...shipmentLine, issued: "10.000000", posted: true, toIssue: "20.000000" }] }} />);
    expect(within(header()).getAllByRole("button").map((button) => button.textContent)).toEqual(["Edit shipment"]);
    expect(screen.getByText(en.shipments.cancel.issued)).toBeTruthy();
    rerender(<ShipmentScreen {...props} messages={pl} locale="pl" shipment={{ ...shipment, status: "completed" }} />);
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(within(header()).getByText("Zakończona").closest("[data-slot=status-badge]")?.getAttribute("data-tone")).toBe("success");
    rerender(<ShipmentScreen {...props} tenant={{ ...props.tenant, readOnly: true }} shipment={{ ...shipment, status: "cancelled" }} />);
    expect(within(header()).getByText("Cancelled").closest("[data-slot=status-badge]")?.querySelector("svg.lucide-circle-x")).toBeTruthy();
    expect(screen.queryByText(en.shipments.cancel.issued)).toBeNull();
  });
});
