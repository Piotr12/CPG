import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MISSING_COMPONENT_MESSAGE, UNKNOWN_INPUT_MESSAGE } from "@cpg/core/validators/production-orders/production-completion.schema";
import { completionPreview as preview, completionView } from "../../../../../tests/setup/production-orders";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { errorFormatter } from "../forms/form-labels";
import { CompletionForm, type CompletionFormProps } from "./completion-form";
import { completionFieldError, productionLabels } from "./labels";

const labels = productionLabels(en);
const t = labels.completion;
const inputs = [
  { value: "00000008", label: "00000008 — Milk (kg)", units: ["kg", "g"] },
  { value: "00000009", label: "00000009 — Filling (kg)", units: ["kg"] },
];
const mocks = { action: vi.fn(), onSuccess: vi.fn(), onBack: vi.fn(), onCancel: vi.fn() };
const props = (overrides: Partial<CompletionFormProps> = {}): CompletionFormProps => ({
  labels,
  preview,
  unit: "each",
  inputs,
  formatError: errorFormatter(labels),
  formatFieldError: completionFieldError(labels),
  ...mocks,
  ...overrides,
});
const actual = (name: string) => screen.getByLabelText(`${t.actual}, ${name}`) as HTMLInputElement;
const post = () => fireEvent.click(screen.getByRole("button", { name: t.submit }));
const result = { completion: completionView, order: { id: "00000001" } };

beforeEach(() => {
  mocks.action.mockResolvedValue({ ok: true, data: result });
});
afterEach(() => vi.clearAllMocks());

describe("CompletionForm", () => {
  it("pre-fills each pinned component with what the recipe expects, before any edit (PRD-010)", () => {
    render(<CompletionForm {...props()} />);
    expect(actual("00000006 Cocoa").value).toBe("2");
    expect(actual("00000007 Wrapper").value).toBe("8");
    expect((screen.getByLabelText(`${t.unit}, 00000006 Cocoa`) as HTMLSelectElement).value).toBe("kg");
    expect([...(screen.getByLabelText(`${t.unit}, 00000006 Cocoa`) as HTMLSelectElement).options].map(({ value }) => value)).toEqual(["kg", "g"]);
    expect(screen.getByText(`${t.expected}: 2 kg · ${t.available}: 40 kg`)).toBeTruthy();
    expect(screen.getByText(t.inactive)).toBeTruthy();
    // Screen readers hear the expected and available figures, and the inactive flag, with the Actual field.
    const wrapperHint = document.getElementById(actual("00000007 Wrapper").getAttribute("aria-describedby")!)!;
    expect(wrapperHint.textContent).toBe(`${t.inactive}${t.expected}: 8 each · ${t.available}: 0 each`);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("posts the edited actuals and an added input, then hands the result on (PRD-013, PRD-015)", async () => {
    render(<CompletionForm {...props()} />);
    fireEvent.change(actual("00000006 Cocoa"), { target: { value: "1800" } });
    fireEvent.change(screen.getByLabelText(`${t.unit}, 00000006 Cocoa`), { target: { value: "g" } });
    fireEvent.change(actual("00000007 Wrapper"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: t.addInput }));
    const added = fill(t.inputLine, "1");
    fireEvent.change(screen.getByLabelText(`${t.material}, ${added}`), { target: { value: "00000008" } });
    expect((screen.getByLabelText(`${t.unit}, ${added}`) as HTMLSelectElement).value).toBe("kg");
    fireEvent.change(screen.getByLabelText(`${t.unit}, ${added}`), { target: { value: "g" } });
    fireEvent.change(actual(added), { target: { value: "500" } });
    post();
    await waitFor(() => expect(mocks.onSuccess).toHaveBeenCalledWith(result));
    expect(mocks.action).toHaveBeenCalledWith({
      quantity: "4",
      unit: "each",
      components: [
        { material: "00000006", quantity: "1800", unit: "g" },
        { material: "00000007", quantity: "0", unit: "each" },
        { material: "00000008", quantity: "500", unit: "g" },
      ],
    });
  });

  it("removes an added input, and empties its units when no material is chosen", () => {
    render(<CompletionForm {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: t.addInput }));
    fireEvent.click(screen.getByRole("button", { name: t.addInput }));
    const second = fill(t.inputLine, "2");
    fireEvent.change(screen.getByLabelText(`${t.material}, ${second}`), { target: { value: "00000009" } });
    fireEvent.change(screen.getByLabelText(`${t.material}, ${second}`), { target: { value: "" } });
    expect((screen.getByLabelText(`${t.unit}, ${second}`) as HTMLSelectElement).options).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: fill(t.removeInput, "1") }));
    expect(screen.queryByLabelText(`${t.material}, ${second}`)).toBeNull();
    expect(screen.getByLabelText(`${t.material}, ${fill(t.inputLine, "1")}`)).toBeTruthy();
  });

  it("clears row errors when a row is removed, since the rows after it move up", async () => {
    mocks.action.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "bad", fieldErrors: { "components.2.material": [UNKNOWN_INPUT_MESSAGE] } } });
    render(<CompletionForm {...props()} />);
    for (const number of ["1", "2"]) {
      fireEvent.click(screen.getByRole("button", { name: t.addInput }));
      fireEvent.change(screen.getByLabelText(`${t.material}, ${fill(t.inputLine, number)}`), { target: { value: number === "1" ? "00000008" : "00000009" } });
      fireEvent.change(actual(fill(t.inputLine, number)), { target: { value: "1" } });
    }
    post();
    await waitFor(() => expect(screen.getByText(t.fieldErrors.unknownInput)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: fill(t.removeInput, "1") }));
    expect(screen.queryByText(t.fieldErrors.unknownInput)).toBeNull();
    expect(screen.getByLabelText(`${t.material}, ${fill(t.inputLine, "1")}`).getAttribute("aria-invalid")).toBeNull();
  });

  it("checks with the shared schema first and shows each problem under its row", async () => {
    render(<CompletionForm {...props()} />);
    fireEvent.change(actual("00000006 Cocoa"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: t.addInput }));
    post();
    expect(mocks.action).not.toHaveBeenCalled();
    // The negative cocoa and the added row's empty quantity.
    expect(screen.getAllByText(t.fieldErrors.quantity)).toHaveLength(2);
    expect(screen.getByText(t.fieldErrors.unknownInput)).toBeTruthy();
    expect(actual("00000006 Cocoa").getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("puts the server's row errors under their rows and any other error above the buttons", async () => {
    mocks.action.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "bad", fieldErrors: { "components.1.quantity": [UNKNOWN_INPUT_MESSAGE], components: [MISSING_COMPONENT_MESSAGE] } },
    });
    render(<CompletionForm {...props()} />);
    post();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t.fieldErrors.missingComponent));
    expect(actual("00000007 Wrapper").getAttribute("aria-invalid")).toBe("true");
    mocks.action.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "bad", fieldErrors: { "components.0.unit": [UNKNOWN_INPUT_MESSAGE] } } });
    post();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByLabelText(`${t.unit}, 00000006 Cocoa`).getAttribute("aria-invalid")).toBe("true");
    mocks.action.mockResolvedValueOnce({
      ok: false,
      error: { code: "INSUFFICIENT_STOCK", message: "short", params: { material: "00000006", location: "00000001", available: "1.000000", requested: "2.000000", unit: "kg" } },
    });
    post();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Material 00000006 at location 00000001: available 1.000000 kg; requested 2.000000 kg."));
    expect(mocks.onSuccess).not.toHaveBeenCalled();
  });

  it("warns past the target and posts only once the user accepts it (PRD-019, spec Q2)", async () => {
    render(<CompletionForm {...props({ preview: { ...preview, produced: "22.000000", exceedsTarget: true, producedAfter: "26.000000" } })} />);
    expect(screen.getByRole("alert").textContent).toBe(`${t.overTitle} Target 24 each, produced 22 each: this completion adds 4 each and completes the order.${t.accept}`);
    post();
    expect(mocks.action).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").at(-1)!.textContent).toBe(t.acceptRequired);
    fireEvent.click(screen.getByLabelText(t.accept));
    post();
    await waitFor(() => expect(mocks.action).toHaveBeenCalledWith(expect.objectContaining({ acceptOverproduction: true })));
  });

  it("shows the warning with the server's figures when another completion got past the target first", async () => {
    mocks.action.mockResolvedValueOnce({
      ok: false,
      error: { code: "PRODUCTION_OVERPRODUCTION", message: "over", params: { produced: "22.000000", target: "24.000000", output: "4.000000", unit: "each" } },
    });
    render(<CompletionForm {...props()} />);
    post();
    await waitFor(() => expect(screen.getByLabelText(t.accept)).toBeTruthy());
    expect(screen.getAllByRole("alert")[0].textContent).toContain("produced 22 each");
    expect(mocks.action).toHaveBeenCalledWith(expect.not.objectContaining({ acceptOverproduction: true }));
    fireEvent.click(screen.getByLabelText(t.accept));
    post();
    await waitFor(() => expect(mocks.action).toHaveBeenLastCalledWith(expect.objectContaining({ acceptOverproduction: true })));
  });

  it("submits on Cmd/Ctrl+Enter, cancels on Escape, goes back and shows the pending state", async () => {
    let finish: (value: unknown) => void = () => undefined;
    mocks.action.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const { container } = render(<CompletionForm {...props()} />);
    const form = container.querySelector("form")!;
    fireEvent.keyDown(form, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("button", { name: t.pending })).toBeTruthy());
    finish({ ok: true, data: result });
    await waitFor(() => expect(mocks.onSuccess).toHaveBeenCalled());
    fireEvent.keyDown(form, { key: "Enter", metaKey: true });
    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(form, { key: "a" });
    fireEvent.keyDown(form, { key: "Escape" });
    expect(mocks.onCancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    fireEvent.click(screen.getByRole("button", { name: t.back }));
    expect(mocks.onCancel).toHaveBeenCalledTimes(2);
    expect(mocks.onBack).toHaveBeenCalledOnce();
  });

  it("speaks Polish", () => {
    const polish = productionLabels(pl);
    render(<CompletionForm {...props({ labels: polish, formatError: errorFormatter(polish), formatFieldError: completionFieldError(polish) })} />);
    expect(screen.getByRole("button", { name: polish.completion.submit })).toBeTruthy();
    expect(screen.getByText(polish.completion.prefilled)).toBeTruthy();
  });
});

function fill(template: string, number: string): string {
  return template.replace("{number}", number);
}
