import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { requisitionCreateSchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { requisitionsLabels } from "./labels";
import { RequisitionForm, type RequisitionFormProps } from "./requisition-form";

const MATERIALS = [
  { value: "00000001", label: "00000001 — Steel (kg)", units: ["kg", "t"] },
  { value: "00000002", label: "00000002 — Bolt (each)", units: ["each"] },
];
const LOCATIONS = [{ value: "00000001", label: "00000001 — Main plant" }];

const action = vi.fn();
const onSuccess = vi.fn();
const onCancel = vi.fn();

function renderForm(props: Partial<RequisitionFormProps<{ id: string }>> = {}) {
  return render(
    <RequisitionForm
      labels={requisitionsLabels(en)}
      materials={MATERIALS}
      locations={LOCATIONS}
      schema={requisitionCreateSchema}
      action={action}
      onSuccess={onSuccess}
      onCancel={onCancel}
      {...props}
    />,
  );
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fill = () => {
  change("Material", "00000001");
  change("Location", "00000001");
  change("Quantity", "100");
  change("Required by", "2027-03-01");
};

describe("RequisitionForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends the material, location, quantity, unit and date as typed (LFC-001)", async () => {
    action.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    renderForm();

    fill();
    change("Unit", "t");
    fireEvent.click(screen.getByRole("button", { name: "Create requisition" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "00000001" }));
    expect(action).toHaveBeenCalledWith({ material: "00000001", location: "00000001", quantity: "100", unit: "t", requiredDate: "2027-03-01" });
  });

  it("offers the units of the chosen material, its base unit first, and none before one is chosen", () => {
    renderForm();
    const units = () => within(screen.getByLabelText("Unit")).queryAllByRole("option").map((option) => option.textContent);

    expect(units()).toEqual([]);
    change("Material", "00000001");
    expect(units()).toEqual(["kg", "t"]);
    expect((screen.getByLabelText("Unit") as HTMLSelectElement).value).toBe("kg");
    change("Material", "00000002");
    expect(units()).toEqual(["each"]);
    change("Material", "");
    expect(units()).toEqual([]);
  });

  it("names every invalid field before sending", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Create requisition" }));

    expect(screen.getByText("Choose a material.")).toBeTruthy();
    expect(screen.getByText("Choose a location.")).toBeTruthy();
    expect(screen.getByText(/^Enter a number greater than 0/)).toBeTruthy();
    expect(screen.getByText("Enter a real date written YYYY-MM-DD.")).toBeTruthy();
    expect(screen.getByLabelText("Quantity").getAttribute("aria-invalid")).toBe("true");
    expect(action).not.toHaveBeenCalled();
  });

  it("leaves an issue about the whole form to the server", () => {
    renderForm({ schema: { safeParse: () => ({ success: false, error: { issues: [{ path: [], message: "Whole form." }] } }) } });
    fireEvent.click(screen.getByRole("button", { name: "Create requisition" }));

    expect(screen.queryByText("Whole form.")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("puts the server's field errors under their fields, translated, and other errors above the buttons", async () => {
    renderForm({ labels: requisitionsLabels(pl) });
    fireEvent.change(screen.getByLabelText("Materiał"), { target: { value: "00000001" } });
    fireEvent.change(screen.getByLabelText("Lokalizacja"), { target: { value: "00000001" } });
    fireEvent.change(screen.getByLabelText("Ilość"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Wymagane do"), { target: { value: "2027-03-01" } });
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Utwórz zapotrzebowanie" }));

    action.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Some fields are invalid.",
        fieldErrors: { unit: ["This material has no conversion from this unit to its base unit."] },
      },
    });
    submit();
    expect(await screen.findByText(pl.purchaseRequisitions.fieldErrors.unitNotConvertible)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    action.mockResolvedValueOnce({ ok: false, error: { code: "LOCATION_INACTIVE", message: "Inactive." } });
    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pl.purchaseRequisitions.errors.LOCATION_INACTIVE));

    action.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { elsewhere: ["?"] } } });
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
});
