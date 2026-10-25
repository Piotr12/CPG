import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { CreateOrderDialog } from "./create-order-dialog";
import { ordersLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createOrder: vi.fn() }));
vi.mock("../../app/admin/[tenant]/purchase-orders/actions", () => ({ createOrder: mocks.createOrder }));

const dialog = () => (
  <CreateOrderDialog
    context={{ tenant: "prod", generation: 1 }}
    labels={ordersLabels(en)}
    suppliers={[{ value: "00000001", code: "00000001", name: "Steel Service" }]}
    locations={[{ value: "00000001", code: "00000001", name: "Main plant" }]}
    materials={[{ value: "00000001", code: "00000001", name: "Steel", detail: "kg", units: ["kg"] }]}
    requisitions={[]}
    locale="en"
  />
);

describe("CreateOrderDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates an order in the page's tenant and generation, and closes (BUY-002)", async () => {
    mocks.createOrder.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create purchase order" }));
    expect(screen.getByRole("dialog", { name: "Create a purchase order" })).toBeTruthy();
    const choose = (label: string, typed: string) => {
      fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value: typed } });
      fireEvent.mouseDown(within(screen.getByRole("listbox", { name: label })).getByRole("option"));
    };
    choose("Supplier", "00000001");
    choose("Location", "plant");
    choose("Material, Line 1", "steel");
    fireEvent.change(screen.getByLabelText("Quantity, Line 1"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Planned, Line 1"), { target: { value: "2027-03-03" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Create purchase order" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createOrder).toHaveBeenCalledWith("prod", 1, {
      supplier: "00000001",
      location: "00000001",
      lines: [{ material: "00000001", quantity: "20", unit: "kg", plannedDate: "2027-03-03", requisition: "" }],
    });
  });

  it("closes on Cancel without sending", () => {
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create purchase order" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });
});
