import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { choices, labels, order } from "../../../../../tests/setup/customer-orders";
import { OrderDialog } from "./order-dialog";

/** A field by its label: a combobox by role, since its list carries the same name (#222). */
const field = (label: string) => screen.queryByRole("combobox", { name: label }) ?? screen.getByLabelText(label);
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("../../app/admin/[tenant]/customer-orders/actions", () => ({ createCustomerOrder: mocks.create, updateCustomerOrder: mocks.update }));
afterEach(() => vi.clearAllMocks());
describe("OrderDialog", () => {
  it("binds the create to tenant/generation and closes on cancellation", () => {
    render(<OrderDialog context={{ tenant: "test", generation: 7 }} labels={labels} choices={choices} />);
    fireEvent.click(screen.getByRole("button", { name: labels.create }));
    expect(screen.getByRole("dialog").className).toContain("overflow-y-auto");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("creates from typed values and closes after success", async () => {
    mocks.create.mockResolvedValue({ ok: true, data: order });
    render(<OrderDialog context={{ tenant: "test", generation: 7 }} labels={labels} choices={choices} />);
    fireEvent.click(screen.getByRole("button", { name: labels.create }));
    const change = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
    change("Customer", "00000001"); change("Location", "00000001"); change("Material, Line 1", "00000005"); fireEvent.mouseDown(screen.getByRole("option", { name: /^00000005/ })); change("Ordered quantity, Line 1", "2"); change("Required date, Line 1", "2027-01-04");
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.create).toHaveBeenCalledWith("test", 7, expect.objectContaining({ customer: "00000001" }));
  });
  it("edits stable line IDs at the page version and closes after success", async () => {
    mocks.update.mockResolvedValue({ ok: true, data: order });
    render(<OrderDialog context={{ tenant: "prod", generation: 1 }} labels={labels} choices={choices} order={order} />);
    fireEvent.click(screen.getByRole("button", { name: labels.edit }));
    fireEvent.change(screen.getByLabelText("Ordered quantity, Line 1"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.update).toHaveBeenCalledWith("prod", 1, order.id, order.version, expect.objectContaining({ lines: [expect.objectContaining({ id: order.lines[0].id, quantity: "80" })] }));
  });
  it("keeps the opening version after a conflict until the user closes and reopens", async () => {
    mocks.update.mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "changed" } });
    const props = { context: { tenant: "prod", generation: 1 }, labels, choices };
    const rendered = render(<OrderDialog {...props} order={order} />);
    fireEvent.click(screen.getByRole("button", { name: labels.edit }));
    const newer = { ...order, version: 4, lines: [{ ...order.lines[0], enteredQuantity: "90" }] };
    rendered.rerender(<OrderDialog {...props} order={newer} />);
    fireEvent.click(screen.getByRole("button", { name: "Save order" })); await screen.findByRole("alert");
    expect(mocks.update).toHaveBeenLastCalledWith("prod", 1, order.id, 3, expect.any(Object));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: labels.edit }));
    expect((screen.getByLabelText("Ordered quantity, Line 1") as HTMLInputElement).value).toBe("90");
    fireEvent.click(screen.getByRole("button", { name: "Save order" })); await screen.findByRole("alert");
    expect(mocks.update).toHaveBeenLastCalledWith("prod", 1, order.id, 4, expect.any(Object));
    fireEvent.keyDown(document, { key: "Escape" }); await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

});
it("keeps posted identity disabled after all fulfilled quantity is reversed, while allowing a quantity edit", () => {
  const posted = { ...order, lines: [{ ...order.lines[0], fulfilled: "0.000000", posted: true }] };
  render(<OrderDialog context={{ tenant: "prod", generation: 1 }} labels={labels} choices={choices} order={posted} />);
  fireEvent.click(screen.getByRole("button", { name: labels.edit }));
  for (const label of ["Customer", "Location", "Material, Line 1", "Unit, Line 1", "Required date, Line 1"]) expect(field(label)).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Remove line 1" })).toHaveProperty("disabled", true);
  expect(screen.getByLabelText("Ordered quantity, Line 1")).toHaveProperty("disabled", false);
  expect(screen.getByText(labels.postedHint)).toBeTruthy();
});
