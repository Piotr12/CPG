import { fireEvent, render, screen, waitFor, within, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { choices, initial, labels } from "../../../../../tests/setup/customer-orders";
import { OrderForm } from "./order-form";
const action = vi.fn(); const onSuccess = vi.fn(); const onCancel = vi.fn();
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: labels.save }));
function renderForm(values?: typeof initial, options = choices) {
  return render(<OrderForm choices={options} labels={labels} initial={values} action={action} onSuccess={onSuccess} onCancel={onCancel} />);
}
function validCreate() {
  change("Customer", "00000001"); change("Location", "00000001");
  change("Material, Line 1", "00000005"); change("Ordered quantity, Line 1", "2");
  change("Unit, Line 1", "case"); change("Required date, Line 1", "2027-01-04");
}
describe("OrderForm", () => {
  afterEach(() => vi.clearAllMocks());
  it("submits one header and multiple dated lines with the entered units", async () => {
    action.mockResolvedValue({ ok: true, data: { id: "00000001" } }); renderForm(); validCreate();
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    change("Material, Line 2", "00000005"); change("Ordered quantity, Line 2", "60"); change("Required date, Line 2", "2027-01-08"); submit();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "00000001" }));
    expect(action).toHaveBeenCalledWith({ customer: "00000001", location: "00000001", lines: [
      { material: "00000005", quantity: "2", unit: "case", requiredDate: "2027-01-04" },
      { material: "00000005", quantity: "60", unit: "each", requiredDate: "2027-01-08" },
    ] });
  });
  it("shows validation next to fields, preserves other rows on removal and bounds additions", () => {
    renderForm(); submit(); expect(screen.getByLabelText("Customer").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(labels.fieldErrors.quantity)).toBeTruthy(); expect(action).not.toHaveBeenCalled();
    validCreate(); fireEvent.click(screen.getByRole("button", { name: "Add line" })); change("Ordered quantity, Line 2", "17");
    fireEvent.click(screen.getByRole("button", { name: "Remove line 1" })); expect((screen.getByLabelText("Ordered quantity, Line 1") as HTMLInputElement).value).toBe("17");
    fireEvent.click(screen.getByRole("button", { name: "Remove line 1" })); submit(); expect(screen.getByRole("alert").textContent).toBe(labels.fieldErrors.lines);
    cleanup(); renderForm({ ...initial, lines: Array.from({ length: 100 }, () => initial.lines[0]) });
    expect((screen.getByRole("button", { name: "Add line" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("retains inactive existing masters and a historical unit absent from current choices", async () => {
    action.mockResolvedValue({ ok: true, data: {} });
    const old = { customer: "00000002", location: "00000002", lines: [{ ...initial.lines[0], material: "00000004", unit: "old-unit" }] };
    renderForm(old);
    expect((screen.getByLabelText("Customer") as HTMLSelectElement).value).toBe("00000002");
    expect((screen.getByLabelText("Location") as HTMLSelectElement).value).toBe("00000002");
    expect(within(screen.getByLabelText("Unit, Line 1")).getByRole("option", { name: "old-unit" })).toBeTruthy();
    submit(); await waitFor(() => expect(action).toHaveBeenCalledWith(old));
    cleanup(); renderForm();
    expect(within(screen.getByLabelText("Customer")).queryByRole("option", { name: "Old Customer A" })).toBeNull();
    expect(within(screen.getByLabelText("Material, Line 1")).queryByRole("option", { name: "Old panel" })).toBeNull();
  });
  it("shows server field errors and generic refusals, with a pending state and cancel keys", async () => {
    action.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "invalid", fieldErrors: { "lines.0.quantity": ["too small"] } } });
    renderForm(initial); submit(); await screen.findByText("too small");
    action.mockResolvedValueOnce({ ok: false, error: { code: "TENANT_READ_ONLY", message: "read only" } }); submit();
    await screen.findByRole("alert"); expect(screen.getByRole("alert").textContent).toBe(labels.errors.TENANT_READ_ONLY);
    let resolve!: (value: unknown) => void; action.mockReturnValueOnce(new Promise((done) => { resolve = done; })); submit();
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    resolve({ ok: true, data: {} }); await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    fireEvent.keyDown(screen.getByRole("button", { name: "Save order" }), { key: "a" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Save order" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(onCancel).toHaveBeenCalledTimes(2);
  });
  it("supports keyboard submit and resets a material with no available units to an empty unit", async () => {
    action.mockResolvedValue({ ok: true, data: {} });
    const options = { ...choices, materials: [{ ...choices.materials[0], units: [] }] }; renderForm(undefined, options);
    change("Material, Line 1", "00000005"); expect((screen.getByLabelText("Unit, Line 1") as HTMLSelectElement).value).toBe("");
    cleanup(); renderForm(initial);
    const form = screen.getByRole("button", { name: "Save order" }).closest("form")!;
    const requestSubmit = vi.spyOn(form, "requestSubmit").mockImplementation(() => { fireEvent.submit(form); });
    fireEvent.keyDown(form, { key: "Enter", ctrlKey: true }); await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    fireEvent.keyDown(form, { key: "Enter", metaKey: true }); expect(requestSubmit).toHaveBeenCalledTimes(2);
  });
});
