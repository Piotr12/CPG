import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { ChangeDateDialog, type ChangeDateDialogProps } from "./change-date-dialog";

const requisitionLabels = {
  ...en.purchaseRequisitions.changeDate,
  field: en.purchaseRequisitions.form.requiredDate,
  cancel: en.purchaseRequisitions.cancel,
  date: en.purchaseRequisitions.fieldErrors.date,
};
const orderLineLabels = {
  ...pl.purchaseOrders.changeDate,
  field: pl.purchaseOrders.form.plannedDate,
  cancel: pl.purchaseOrders.cancel,
  date: pl.purchaseOrders.fieldErrors.date,
};

function props(overrides: Partial<ChangeDateDialogProps> = {}): ChangeDateDialogProps {
  return {
    kind: "requisition",
    available: true,
    subject: "Purchase requisitions 00000003",
    value: "2027-03-01",
    version: 2,
    save: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    labels: requisitionLabels,
    errors: en.errors,
    ...overrides,
  };
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(() => vi.clearAllMocks());

describe("ChangeDateDialog", () => {
  it("prefills a requisition's required date and saves the new one at the version it opened with", async () => {
    const input = props();
    render(<ChangeDateDialog {...input} />);

    fireEvent.click(screen.getByRole("button", { name: "Change date — Purchase requisitions 00000003" }));
    expect(screen.getByRole("dialog", { name: "Change required date — Purchase requisitions 00000003" })).toBeTruthy();
    expect(screen.getByText(en.purchaseRequisitions.changeDate.description)).toBeTruthy();
    expect((screen.getByLabelText("Required by") as HTMLInputElement).value).toBe("2027-03-01");
    change("Required by", "2027-04-01");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(input.save).toHaveBeenCalledWith(2, { requiredDate: "2027-04-01" });
  });

  it("names a line's planned date in Polish, refuses an empty one before saving, and shows a server field message as sent", async () => {
    const input = props({
      kind: "orderLine",
      subject: "Zamówienia zakupu 00000002 — Pozycja 2",
      value: "2027-03-05",
      labels: orderLineLabels,
      errors: pl.errors,
      save: vi.fn().mockResolvedValue({ ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid.", fieldErrors: { plannedDate: ["Too late."] } } }),
    });
    render(<ChangeDateDialog {...input} />);

    fireEvent.click(screen.getByRole("button", { name: "Zmień datę — Zamówienia zakupu 00000002 — Pozycja 2" }));
    expect(screen.getByRole("dialog", { name: "Zmień planowaną datę — Zamówienia zakupu 00000002 — Pozycja 2" })).toBeTruthy();
    change(pl.purchaseOrders.form.plannedDate, "");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(screen.getByText(pl.purchaseOrders.fieldErrors.date)).toBeTruthy();
    expect(input.save).not.toHaveBeenCalled();

    change(pl.purchaseOrders.form.plannedDate, "2027-03-20");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Zapisz" })));
    expect(input.save).toHaveBeenCalledWith(2, { plannedDate: "2027-03-20" });
    expect(screen.getByText("Too late.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog, its refusal and the version it opened with when a conflict refresh makes the record uneditable", async () => {
    const original = props({ save: vi.fn().mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "Changed." } }) });
    const { rerender } = render(<ChangeDateDialog {...original} />);

    fireEvent.click(screen.getByRole("button", { name: /Change date —/ }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByRole("alert").textContent).toBe(en.errors.VERSION_CONFLICT);

    const refreshed = props({ available: false, version: 3, value: "2027-05-01" });
    rerender(<ChangeDateDialog {...refreshed} />);
    expect(screen.getByRole("alert").textContent).toBe(en.errors.VERSION_CONFLICT);
    expect((screen.getByLabelText("Required by") as HTMLInputElement).value).toBe("2027-03-01");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(original.save).toHaveBeenLastCalledWith(2, { requiredDate: "2027-03-01" });
    expect(refreshed.save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("binds a reopened dialog to the newer date and version", async () => {
    const original = props();
    const { rerender } = render(<ChangeDateDialog {...original} />);
    const refreshed = props({ version: 3, value: "2027-05-01" });
    rerender(<ChangeDateDialog {...refreshed} />);

    fireEvent.click(screen.getByRole("button", { name: /Change date —/ }));
    expect((screen.getByLabelText("Required by") as HTMLInputElement).value).toBe("2027-05-01");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    expect(refreshed.save).toHaveBeenCalledWith(3, { requiredDate: "2027-05-01" });
    expect(original.save).not.toHaveBeenCalled();
  });
});
