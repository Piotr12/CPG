import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { orderCreateSchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { ordersLabels } from "./labels";
import { OrderForm, type OrderFormProps } from "./order-form";

const SUPPLIERS = [{ value: "00000001", code: "00000001", name: "Steel Service" }];
const LOCATIONS = [
  { value: "00000001", code: "00000001", name: "Main plant" },
  { value: "00000002", code: "00000002", name: "Warehouse" },
];
const MATERIALS = [
  { value: "00000001", code: "00000001", name: "Steel", detail: "kg", units: ["kg", "t"] },
  { value: "00000002", code: "00000002", name: "Bolt", detail: "each", units: ["each"] },
];
const REQUISITIONS = [{ value: "00000007", label: "00000007 — 40 kg outstanding", material: "00000001", location: "00000001" }];

const action = vi.fn();
const onSuccess = vi.fn();
const onCancel = vi.fn();

function renderForm(props: Partial<OrderFormProps<{ id: string }>> = {}) {
  return render(
    <OrderForm
      labels={ordersLabels(en)}
      suppliers={SUPPLIERS}
      locations={LOCATIONS}
      materials={MATERIALS}
      requisitions={REQUISITIONS}
      locale="en"
      schema={orderCreateSchema}
      action={action}
      onSuccess={onSuccess}
      onCancel={onCancel}
      {...props}
    />,
  );
}
const lineField = (field: string, number: number) => screen.getByLabelText(`${field}, Line ${number}`);
/** Types `code` into the autocomplete named `label` (material, supplier or location) and clicks its option; "" clears it. */
const choose = (label: string, code: string) => {
  const combobox = screen.getByRole("combobox", { name: label });
  fireEvent.change(combobox, { target: { value: code } });
  if (code === "") {
    fireEvent.blur(combobox);
    return;
  }
  const listbox = document.getElementById(combobox.getAttribute("aria-controls")!)!;
  fireEvent.mouseDown(within(listbox).getAllByRole("option").find((option) => option.textContent!.startsWith(code))!);
};
const chooseLine = (number: number, code: string) => choose(`Material, Line ${number}`, code);
const setLine = (number: number, material: string, quantity: string, plannedDate: string) => {
  chooseLine(number, material);
  fireEvent.change(lineField("Quantity", number), { target: { value: quantity } });
  fireEvent.change(lineField("Planned", number), { target: { value: plannedDate } });
};
const optionsOf = (element: HTMLElement) => within(element).queryAllByRole("option").map((option) => option.textContent);
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create purchase order" }));

describe("OrderForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends the supplier, the location and every line as typed, with each line's unit, date and requisition (BUY-002, BUY-003, BUY-008)", async () => {
    action.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    renderForm();

    choose("Supplier", "00000001");
    choose("Location", "00000001");
    setLine(1, "00000001", "40", "2027-03-03");
    fireEvent.change(lineField("Requisition", 1), { target: { value: "00000007" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add line" }));
    setLine(2, "00000002", "10", "2027-03-05");
    submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "00000001" }));
    expect(action).toHaveBeenCalledWith({
      supplier: "00000001",
      location: "00000001",
      lines: [
        { material: "00000001", quantity: "40", unit: "kg", plannedDate: "2027-03-03", requisition: "00000007" },
        { material: "00000002", quantity: "10", unit: "each", plannedDate: "2027-03-05", requisition: "" },
      ],
    });
  });

  it("offers each line the units of its own material, resetting to the base unit when the material changes", () => {
    renderForm();

    expect(optionsOf(lineField("Unit", 1))).toEqual([]);
    chooseLine(1, "00000001");
    expect(optionsOf(lineField("Unit", 1))).toEqual(["kg", "t"]);
    fireEvent.change(lineField("Unit", 1), { target: { value: "t" } });
    chooseLine(1, "00000002");
    expect((lineField("Unit", 1) as HTMLSelectElement).value).toBe("each");
    chooseLine(1, "");
    expect(optionsOf(lineField("Unit", 1))).toEqual([]);
  });

  it("offers a line only the open requisitions of its material and the order's location, and clears a choice that stops matching", () => {
    renderForm();
    choose("Location", "00000001");
    chooseLine(1, "00000002");
    expect(optionsOf(lineField("Requisition", 1))).toEqual(["No requisition"]);

    chooseLine(1, "00000001");
    expect(optionsOf(lineField("Requisition", 1))).toEqual(["No requisition", "00000007 — 40 kg outstanding"]);
    fireEvent.change(lineField("Requisition", 1), { target: { value: "00000007" } });
    choose("Location", "00000001");
    expect((lineField("Requisition", 1) as HTMLSelectElement).value).toBe("00000007");

    choose("Location", "00000002");
    expect((lineField("Requisition", 1) as HTMLSelectElement).value).toBe("");
    expect(optionsOf(lineField("Requisition", 1))).toEqual(["No requisition"]);

    choose("Location", "00000001");
    fireEvent.change(lineField("Requisition", 1), { target: { value: "00000007" } });
    chooseLine(1, "00000002");
    expect((lineField("Requisition", 1) as HTMLSelectElement).value).toBe("");
  });

  it("removes the right line, named by its material, keeping the others' typed text", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "+ Add line" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add line" }));
    setLine(1, "00000001", "1", "2027-03-01");
    setLine(2, "00000002", "2", "2027-03-02");
    setLine(3, "00000001", "3", "2027-03-03");

    fireEvent.click(screen.getAllByRole("button", { name: "Remove 00000001 — Steel (kg)" })[0]);

    expect((lineField("Quantity", 1) as HTMLInputElement).value).toBe("2");
    expect((lineField("Quantity", 2) as HTMLInputElement).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "+ Add line" }));
    expect(screen.getByRole("button", { name: "Remove this line" })).toBeTruthy();
  });

  it("names every invalid field before sending, a line's under that line", () => {
    renderForm();
    setLine(1, "00000001", "0", "soon");
    submit();

    expect(screen.getByText("Choose a supplier.")).toBeTruthy();
    expect(screen.getByText("Choose a location.")).toBeTruthy();
    expect(screen.getByText(/^Enter a number greater than 0/)).toBeTruthy();
    expect(screen.getByText("Enter a real date written YYYY-MM-DD.")).toBeTruthy();
    expect(lineField("Quantity", 1).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/^Enter a number greater than 0/).id).toBe(lineField("Quantity", 1).getAttribute("aria-describedby"));
    expect(action).not.toHaveBeenCalled();
  });

  it("asks for a line when the last one is removed", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Remove this line" }));
    choose("Supplier", "00000001");
    choose("Location", "00000001");
    submit();

    expect(screen.getByText("Add at least 1 and at most 100 lines.")).toBeTruthy();
  });

  it("puts the server's line errors on their lines, and shows other errors above the buttons, translated", async () => {
    renderForm({ labels: ordersLabels(pl) });
    choose("Dostawca", "00000001");
    choose("Lokalizacja", "00000001");
    choose("Materiał, Pozycja 1", "00000001");
    fireEvent.change(screen.getByLabelText("Ilość, Pozycja 1"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Planowana, Pozycja 1"), { target: { value: "2027-03-03" } });
    const send = () => fireEvent.click(screen.getByRole("button", { name: "Utwórz zamówienie zakupu" }));

    action.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Some fields are invalid.",
        fieldErrors: { "lines.0.requisition": ["The requisition is for another location than this order."] },
      },
    });
    send();
    expect(await screen.findByText(pl.purchaseOrders.fieldErrors.requisitionLocation)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    action.mockResolvedValueOnce({ ok: false, error: { code: "REQUISITION_OVER_CONVERTED", message: "Over." } });
    send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pl.purchaseOrders.errors.REQUISITION_OVER_CONVERTED));

    action.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { elsewhere: ["?"] } } });
    send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pl.errors.VALIDATION_FAILED));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("clears line errors when a line is removed or added, so none lands on the wrong row", async () => {
    action.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { "lines.1.unit": ["This material has no conversion from this unit to its base unit."] } },
    });
    renderForm({ schema: { safeParse: () => ({ success: true }) } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add line" }));
    setLine(1, "00000001", "1", "2027-03-01");
    setLine(2, "00000002", "2", "2027-03-02");
    submit();
    expect(await screen.findByText("This material has no conversion from this unit to its base unit.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove 00000001 — Steel (kg)" }));
    expect(screen.queryByText("This material has no conversion from this unit to its base unit.")).toBeNull();
  });

  it("leaves an issue about the whole form to the server", () => {
    renderForm({ schema: { safeParse: () => ({ success: false, error: { issues: [{ path: [], message: "Whole form." }, { path: ["supplier"], message: "Supplier." }] } }) } });
    submit();

    expect(screen.getByText("Supplier.")).toBeTruthy();
    expect(screen.queryByText("Whole form.")).toBeNull();
  });

  it("submits with Cmd/Ctrl+Enter, shows its pending label, and cancels with Escape or Cancel", async () => {
    let finish: (value: unknown) => void = () => {};
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm({ schema: { safeParse: () => ({ success: true }) } });

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Supplier" }), { key: "Enter", ctrlKey: true });
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeTruthy();
    finish({ ok: true, data: { id: "00000001" } });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Supplier" }), { key: "Enter", metaKey: true });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Supplier" }), { key: "Enter" });
    expect(action).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Supplier" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("chooses the supplier and the location in autocompletes named by their labels, refusing other text (#222)", () => {
    renderForm();
    const supplier = screen.getByRole("combobox", { name: "Supplier" });
    expect(supplier.getAttribute("placeholder")).toBe("Type an ID or a name");
    fireEvent.change(supplier, { target: { value: "steel" } });
    expect(within(screen.getByRole("listbox", { name: "Supplier" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["00000001—Steel Service"]);
    fireEvent.change(supplier, { target: { value: "acme" } });
    expect(screen.getByRole("listbox", { name: "Supplier" }).textContent).toBe("No supplier matches “acme”.");
    fireEvent.blur(supplier);
    expect(screen.getByText("Choose a supplier from the list.")).toBeTruthy();

    const location = screen.getByRole("combobox", { name: "Location" });
    fireEvent.change(location, { target: { value: "ware" } });
    expect(within(screen.getByRole("listbox", { name: "Location" })).getAllByRole("option").map((option) => option.textContent)).toEqual(["00000002—Warehouse"]);
    fireEvent.change(location, { target: { value: "dock" } });
    fireEvent.keyDown(location, { key: "Enter" });
    expect(screen.getByText("Choose a location from the list.")).toBeTruthy();
    submit();
    expect(screen.getByText("Choose a supplier.")).toBeTruthy();
    expect(screen.getByText("Choose a location.")).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("gives every line's material autocomplete its own name, and leaves Escape to an open list (#217)", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "+ Add line" }));
    expect([...document.querySelectorAll("[data-line] [aria-autocomplete=list]")].map((combobox) => combobox.getAttribute("aria-label"))).toEqual(["Material, Line 1", "Material, Line 2"]);
    expect(screen.getByRole("combobox", { name: "Material, Line 2" }).getAttribute("placeholder")).toBe("Type an ID or a name");

    const second = screen.getByRole("combobox", { name: "Material, Line 2" });
    act(() => second.focus());
    fireEvent.change(second, { target: { value: "bolt" } });
    expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual(["", "", "", "1 material"]);
    fireEvent.keyDown(second, { key: "Escape" });
    expect(second.getAttribute("aria-expanded")).toBe("false");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
