import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { transferCreateSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { transfersLabels } from "./labels";
import { TransferForm, type TransferFormProps } from "./transfer-form";

const MATERIALS = [
  { value: "00000001", code: "00000001", name: "Steel", detail: "kg", units: ["kg", "t"] },
  { value: "00000002", code: "00000002", name: "Bolt", detail: "each", units: ["each"] },
];
const LOCATIONS = [
  { value: "00000001", label: "00000001 — Main plant" },
  { value: "00000002", label: "00000002 — Warehouse" },
];

const action = vi.fn();
const onSuccess = vi.fn();
const onCancel = vi.fn();

function renderForm(props: Partial<TransferFormProps<{ id: string }>> = {}) {
  return render(
    <TransferForm
      labels={transfersLabels(en)}
      materials={MATERIALS}
      locations={LOCATIONS}
      locale="en"
      schema={transferCreateSchema}
      action={action}
      onSuccess={onSuccess}
      onCancel={onCancel}
      {...props}
    />,
  );
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** Types `code` into the material autocomplete and clicks its option; "" clears it. */
const choose = (code: string, label = "Material") => {
  const combobox = screen.getByRole("combobox", { name: label });
  fireEvent.change(combobox, { target: { value: code } });
  if (code === "") {
    fireEvent.blur(combobox);
    return;
  }
  fireEvent.mouseDown(within(screen.getByRole("listbox", { name: label })).getAllByRole("option").find((option) => option.textContent!.startsWith(code))!);
};
const fill = () => {
  choose("00000001");
  change("From", "00000001");
  change("To", "00000002");
  change("Quantity", "100");
  change("Planned dispatch", "2027-03-01");
  change("Planned arrival", "2027-03-03");
};

describe("TransferForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends the material, both locations, the quantity, unit and planned dates as typed (TRF-001)", async () => {
    action.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    renderForm();

    fill();
    change("Unit", "t");
    fireEvent.click(screen.getByRole("button", { name: "Create transfer" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "00000001" }));
    expect(action).toHaveBeenCalledWith({
      material: "00000001", source: "00000001", destination: "00000002", quantity: "100", unit: "t", plannedDispatch: "2027-03-01", plannedArrival: "2027-03-03",
    });
  });

  it("offers the units of the chosen material, its base unit first, and none before one is chosen", () => {
    renderForm();
    const units = () => within(screen.getByLabelText("Unit")).queryAllByRole("option").map((option) => option.textContent);

    expect(units()).toEqual([]);
    choose("00000001");
    expect(units()).toEqual(["kg", "t"]);
    expect((screen.getByLabelText("Unit") as HTMLSelectElement).value).toBe("kg");
    choose("00000002");
    expect(units()).toEqual(["each"]);
    choose("");
    expect(units()).toEqual([]);
  });

  it("names every invalid field before sending, including the same location twice and an arrival before dispatch (TRF-026)", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Create transfer" }));
    expect(screen.getByText("Choose a material.")).toBeTruthy();
    expect(screen.getAllByText("Choose a location.")).toHaveLength(2);
    expect(screen.getByText(/^Enter a number greater than 0/)).toBeTruthy();
    expect(screen.getAllByText("Enter a real date written YYYY-MM-DD.")).toHaveLength(2);

    fill();
    change("To", "00000001");
    change("Planned arrival", "2027-02-28");
    fireEvent.click(screen.getByRole("button", { name: "Create transfer" }));
    expect(screen.getByText(en.transfers.fieldErrors.sameLocation)).toBeTruthy();
    expect(screen.getByText(en.transfers.fieldErrors.arrivalBeforeDispatch)).toBeTruthy();
    expect(screen.getByLabelText("To").getAttribute("aria-invalid")).toBe("true");
    expect(action).not.toHaveBeenCalled();
  });

  it("puts the server's field errors under their fields, translated, and other errors above the buttons", async () => {
    renderForm({ labels: transfersLabels(pl), schema: { safeParse: () => ({ success: true }) } });
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Utwórz przesunięcie" }));

    action.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { unit: ["This material has no conversion from this unit to its base unit."] } },
    });
    submit();
    expect(await screen.findByText(pl.transfers.fieldErrors.unitNotConvertible)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    action.mockResolvedValueOnce({ ok: false, error: { code: "LOCATION_INACTIVE", message: "Inactive." } });
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pl.transfers.errors.LOCATION_INACTIVE));

    action.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { materials: ["A transfer moves one material: create one transfer per material."] } } });
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pl.errors.VALIDATION_FAILED));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("submits with Cmd/Ctrl+Enter, shows its pending label, and cancels with Escape or Cancel", async () => {
    let finish: (value: unknown) => void = () => {};
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm({ schema: { safeParse: () => ({ success: true }) } });

    fireEvent.keyDown(screen.getByLabelText("Quantity"), { key: "Enter", ctrlKey: true });
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeTruthy();
    finish({ ok: true, data: { id: "00000001" } });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    fireEvent.keyDown(screen.getByLabelText("Quantity"), { key: "Enter", metaKey: true });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(screen.getByLabelText("Quantity"), { key: "Enter" });
    expect(action).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByLabelText("Quantity"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
  it("chooses the material in an autocomplete that refuses free text, and leaves Escape to its open list (#217)", () => {
    renderForm({ labels: transfersLabels(pl), locale: "pl" });
    const material = screen.getByRole("combobox", { name: "Materiał" });
    expect(material.getAttribute("placeholder")).toBe(pl.lists.materialPicker.placeholder);

    act(() => material.focus());
    fireEvent.change(material, { target: { value: "stal" } });
    fireEvent.keyDown(material, { key: "Escape" });
    expect(material.getAttribute("aria-expanded")).toBe("false");
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.blur(material);
    expect(screen.getByText(pl.lists.materialPicker.refused)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: pl.transfers.create.submit }));
    expect(action).not.toHaveBeenCalled();
  });
});
