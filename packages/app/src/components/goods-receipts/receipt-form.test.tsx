import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { receiptFormSchema, RECEIPT_LINE_COUNT_MESSAGE } from "@cpg/core/validators/goods-receipts/goods-receipt.schema";
import { UNIT_NOT_CONVERTIBLE_MESSAGE } from "@cpg/core/validators/boms/bom-fields.schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { receiptsLabels } from "./labels";
import { ReceiptForm, type ReceiptFormProps } from "./receipt-form";

const LINES = [
  { line: 1, label: "Line 1: 00000001 Steel sheet", outstanding: "70 kg outstanding", units: ["kg", "t"] },
  { line: 2, label: "Line 2: 00000002 Bolt M8", outstanding: "10 each outstanding", units: ["each"] },
];

const action = vi.fn();
const onSuccess = vi.fn();
const onCancel = vi.fn();

function renderForm(props: Partial<ReceiptFormProps<{ id: string }>> = {}) {
  return render(
    <ReceiptForm labels={receiptsLabels(en)} lines={LINES} schema={receiptFormSchema} action={action} onSuccess={onSuccess} onCancel={onCancel} {...props} />,
  );
}
const quantity = (line: number) => screen.getByLabelText(`Quantity received, ${LINES[line - 1].label}`);
const unit = (line: number) => screen.getByLabelText(`Unit, ${LINES[line - 1].label}`);
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Post goods receipt" }));

describe("ReceiptForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows each line's outstanding, and sends only the lines with a quantity, in the unit chosen (BUY-012)", async () => {
    action.mockResolvedValue({ ok: true, data: { id: "00000004" } });
    renderForm();

    expect(screen.getByText("70 kg outstanding")).toBeTruthy();
    expect((unit(1) as HTMLSelectElement).value).toBe("kg");
    fireEvent.change(quantity(1), { target: { value: "0.02" } });
    fireEvent.change(unit(1), { target: { value: "t" } });
    submit();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "00000004" }));
    expect(action).toHaveBeenCalledWith({ lines: [{ line: 1, quantity: "0.02", unit: "t" }] });
  });

  it("asks for a quantity when every line is empty, and sends nothing", () => {
    renderForm();

    fireEvent.change(quantity(2), { target: { value: "   " } });
    submit();

    expect(screen.getByText(en.goodsReceipts.post.nothing)).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("checks quantities before sending and shows the message under the line", () => {
    renderForm();

    fireEvent.change(quantity(2), { target: { value: "0" } });
    submit();

    expect(screen.getByText(en.goodsReceipts.fieldErrors.quantity)).toBeTruthy();
    expect(quantity(2).getAttribute("aria-invalid")).toBe("true");
    expect(quantity(1).getAttribute("aria-invalid")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the server's line errors under the line they name, by the receipt's order of lines", async () => {
    action.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid.", fieldErrors: { "lines.0.unit": [UNIT_NOT_CONVERTIBLE_MESSAGE] } },
    });
    renderForm({ labels: receiptsLabels(pl) });

    fireEvent.change(screen.getByLabelText(`Przyjęta ilość, ${LINES[1].label}`), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Zaksięguj przyjęcie towaru" }));

    expect(await screen.findByText(pl.goodsReceipts.fieldErrors.unitNotConvertible)).toBeTruthy();
    expect(screen.getByLabelText(`Jednostka, ${LINES[1].label}`).getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a field error that names no row, and a refusal without fields, above the buttons", async () => {
    action.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid.", fieldErrors: { lines: [RECEIPT_LINE_COUNT_MESSAGE], "lines.5.unit": ["x"] } },
    });
    renderForm();
    fireEvent.change(quantity(1), { target: { value: "5" } });
    submit();
    expect(await screen.findByText(en.goodsReceipts.fieldErrors.lines)).toBeTruthy();

    action.mockResolvedValueOnce({ ok: false, error: { code: "PURCHASE_ORDER_NOT_OPEN", message: "Completed." } });
    submit();
    expect(await screen.findByText(en.goodsReceipts.errors.PURCHASE_ORDER_NOT_OPEN)).toBeTruthy();
    expect(quantity(1).getAttribute("aria-invalid")).toBeNull();
  });

  it("submits on Cmd/Ctrl+Enter, cancels on Escape and on Cancel, and says it is posting", async () => {
    let resolve: (value: unknown) => void = () => {};
    action.mockReturnValue(new Promise((done) => (resolve = done)));
    renderForm();

    fireEvent.change(quantity(1), { target: { value: "5" } });
    fireEvent.keyDown(quantity(1), { key: "Enter", ctrlKey: true });
    expect(await screen.findByRole("button", { name: "Posting…" })).toBeTruthy();
    resolve({ ok: true, data: { id: "00000001" } });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    fireEvent.keyDown(quantity(1), { key: "Enter" });
    fireEvent.keyDown(quantity(1), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
