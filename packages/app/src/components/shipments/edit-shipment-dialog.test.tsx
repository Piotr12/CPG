import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { EditShipmentDialog } from "./edit-shipment-dialog";
import { shipmentsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ updateShipment: vi.fn() }));
vi.mock("../../app/admin/[tenant]/shipments/[id]/actions", () => ({ updateShipment: mocks.updateShipment }));

const A = "7f0c8a8e-3b7b-4a52-9a39-1f2a0e6b2c11";
const B = "0b5f2b52-6a0e-4ac4-8a4b-2d5b6d0e9f22";
const LINES = [
  { key: A, label: "Line 1: 00000005 Cabinet", hint: "Planned 50 each, issued 30 each, at least 30 each", units: ["each", "case"], initial: { quantity: "50", unit: "each" } },
  { key: B, label: "Order line 2: 00000006 Shelf", hint: "40 each outstanding", units: ["each"] },
];
const dialog = (version = 3) => (
  <EditShipmentDialog
    context={{ tenant: "prod", generation: 4 }}
    shipment="00000011"
    customerOrder="00000007"
    version={version}
    location="00000001 Main plant"
    labels={shipmentsLabels(en)}
    lines={LINES}
    plannedDate="2026-11-16"
  />
);
const quantity = (index: number) => screen.getByLabelText(`Quantity to ship, ${LINES[index].label}`);

describe("EditShipmentDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("opens on the stored plan and saves the whole new plan at the version it opened with, then closes (shipment edit spec Q2, Q8)", async () => {
    mocks.updateShipment.mockResolvedValue({ ok: true, data: { id: "00000011" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Edit shipment" }));
    expect(screen.getByRole("dialog", { name: "Edit shipment 00000011" }).textContent).toContain("planned to leave 00000001 Main plant");
    expect((screen.getByLabelText("Planned date") as HTMLInputElement).value).toBe("2026-11-16");
    expect((quantity(0) as HTMLInputElement).value).toBe("50");
    expect(screen.getByText(LINES[0].hint)).toBeTruthy();
    fireEvent.change(quantity(0), { target: { value: "40" } });
    fireEvent.change(quantity(1), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.updateShipment).toHaveBeenCalledWith("prod", 4, "00000011", "00000007", 3, {
      plannedDate: "2026-11-16",
      lines: [{ orderLine: A, quantity: "40", unit: "each" }, { orderLine: B, quantity: "5", unit: "each" }],
    });
  });

  it("keeps the version it opened with when the page refreshes behind it, and shows a refusal naming the line", async () => {
    mocks.updateShipment.mockResolvedValue({ ok: false, error: { code: "SHIPMENT_LINE_ISSUED", message: "x", params: { line: "1" } } });
    const { rerender } = render(dialog(3));
    fireEvent.click(screen.getByRole("button", { name: "Edit shipment" }));
    rerender(dialog(5));
    fireEvent.change(quantity(0), { target: { value: "" } });
    fireEvent.change(quantity(1), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Line 1 has goods issued against it, so it stays on the shipment. Lower it to what was issued instead.")).toBeTruthy();
    expect(mocks.updateShipment.mock.calls[0][4]).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit shipment" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Reopened, it takes the page's newer version.
    fireEvent.click(screen.getByRole("button", { name: "Edit shipment" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateShipment).toHaveBeenCalledTimes(2));
    expect(mocks.updateShipment.mock.calls[1][4]).toBe(5);
  });
});
