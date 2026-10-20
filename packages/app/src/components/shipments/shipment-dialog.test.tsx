import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { shipmentsLabels } from "./labels";
import { ShipmentDialog } from "./shipment-dialog";

const mocks = vi.hoisted(() => ({ createShipment: vi.fn() }));
vi.mock("../../app/admin/[tenant]/customer-orders/[id]/actions", () => ({ createShipment: mocks.createShipment }));

const A = "7f0c8a8e-3b7b-4a52-9a39-1f2a0e6b2c11";
const LINES = [{ key: A, label: "Line 1: 00000005 Cabinet", hint: "24 each outstanding", units: ["each", "case"] }];
const dialog = () => (
  <ShipmentDialog
    context={{ tenant: "prod", generation: 3 }}
    customerOrder="00000007"
    location="00000001 Main plant"
    labels={shipmentsLabels(en)}
    lines={LINES}
    plannedDate="2027-01-04"
  />
);
const create = (quantity: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Create shipment" }));
  fireEvent.change(screen.getByLabelText(`Quantity to ship, ${LINES[0].label}`), { target: { value: quantity } });
  fireEvent.click(screen.getAllByRole("button", { name: "Create shipment" }).at(-1)!);
};

describe("ShipmentDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates against the page's order, tenant and generation with the planned date, closes, and links to the new shipment (SAL-006)", async () => {
    mocks.createShipment.mockResolvedValue({ ok: true, data: { id: "00000005" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create shipment" }));
    expect(screen.getByRole("dialog", { name: "Create a shipment" }).textContent).toContain("planned to leave 00000001 Main plant");
    expect((screen.getByLabelText("Planned date") as HTMLInputElement).value).toBe("2027-01-04");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    create("24");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createShipment).toHaveBeenCalledWith("prod", 3, "00000007", { plannedDate: "2027-01-04", lines: [{ orderLine: A, quantity: "24", unit: "each" }] });
    expect(screen.getByRole("status").textContent).toContain("Shipment 00000005 created.");
    expect(screen.getByRole("link", { name: "Open shipment 00000005" }).getAttribute("href")).toBe("/admin/prod/shipments/00000005");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the service's refusal of a line beside it, and clears an earlier notice when a new shipment is started", async () => {
    mocks.createShipment.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid.", fieldErrors: { "lines.0.quantity": ["This is more than the order line still has outstanding."] } },
    });
    render(dialog());
    create("25");
    expect(await screen.findByText(en.shipments.fieldErrors.outstanding)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    mocks.createShipment.mockResolvedValueOnce({ ok: true, data: { id: "00000006" } });
    create("1");
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Create shipment" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
