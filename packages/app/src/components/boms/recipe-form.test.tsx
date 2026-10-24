import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { bomCreateFormSchema, bomRecipeFormSchema } from "@cpg/core/validators/boms/bom-create.schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { bomsLabels } from "./labels";
import { RecipeForm, type ComponentChoice, type OutputChoice, type RecipeFormProps } from "./recipe-form";

const OUTPUTS: OutputChoice[] = [{ value: "00000005", code: "00000005", name: "Cabinet, red", detail: "each", baseUnit: "each" }];
const CHOICES: ComponentChoice[] = [
  { value: "00000002", code: "00000002", name: "Bolt M8", detail: "each", units: ["each", "case"] },
  { value: "00000003", code: "00000003", name: "Paint, red", detail: "l", units: ["l", "ml"] },
];

const action = vi.fn();
const onSuccess = vi.fn();
const onCancel = vi.fn();

function renderForm(props: Partial<RecipeFormProps<{ id: string }>> = {}) {
  return render(
    <RecipeForm
      labels={bomsLabels(en)}
      outputs={OUTPUTS}
      choices={CHOICES}
      locale="en"
      schema={bomCreateFormSchema}
      action={action}
      submitLabel="Create BOM"
      pendingLabel="Creating…"
      onSuccess={onSuccess}
      onCancel={onCancel}
      {...props}
    />,
  );
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const lineField = (field: string, number: number) => screen.getByLabelText(`${field}, Line ${number}`);
/** A material picker by its accessible name (its list carries the same name). */
const picker = (name: string) => screen.getByRole("combobox", { name });
/** Chooses `code` in a material picker as a person does: types it, then clicks its row. */
const choose = (name: string, code: string) => {
  fireEvent.change(picker(name), { target: { value: code } });
  fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(`^${code}`) }));
};
const setLine = (number: number, material: string, quantity: string, unit?: string) => {
  choose(`Material, Line ${number}`, material);
  fireEvent.change(lineField("Quantity", number), { target: { value: quantity } });
  if (unit) fireEvent.change(lineField("Unit", number), { target: { value: unit } });
};
const optionsOf = (element: HTMLElement) => within(element).queryAllByRole("option").map((option) => option.textContent);

describe("RecipeForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends the output, the dates and every line as typed, with each line's unit (BOM-001, MAT-019)", async () => {
    action.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    renderForm();

    expect(screen.getByText("Per 1 base unit of the output")).toBeTruthy();
    choose("Output", "00000005");
    expect(picker("Output").getAttribute("placeholder")).toBe("Type an ID or a name");
    expect((picker("Output") as HTMLInputElement).value).toBe("00000005 — Cabinet, red");
    expect(screen.getByText("Per 1 each of Cabinet, red")).toBeTruthy();
    change("Priority", "2");
    change("Valid from", "2027-01-01");
    setLine(1, "00000002", "2", "case");
    fireEvent.click(screen.getByRole("button", { name: "+ Add component" }));
    setLine(2, "00000003", "250");
    expect((lineField("Unit", 2) as HTMLSelectElement).value).toBe("l");
    fireEvent.change(lineField("Unit", 2), { target: { value: "ml" } });
    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: "00000001" }));
    expect(action).toHaveBeenCalledWith({
      output: "00000005",
      priority: "2",
      validFrom: "2027-01-01",
      validThrough: "",
      components: [
        { material: "00000002", quantity: "2", unit: "case" },
        { material: "00000003", quantity: "250", unit: "ml" },
      ],
    });
  });

  it("offers each line the units of its own material, resetting to the base unit when the material changes", () => {
    renderForm();

    expect(optionsOf(lineField("Unit", 1))).toEqual([]);
    choose("Material, Line 1", "00000002");
    expect(optionsOf(lineField("Unit", 1))).toEqual(["each", "case"]);
    fireEvent.change(lineField("Unit", 1), { target: { value: "case" } });
    choose("Material, Line 1", "00000003");
    expect((lineField("Unit", 1) as HTMLSelectElement).value).toBe("l");
    fireEvent.change(picker("Material, Line 1"), { target: { value: "" } });
    fireEvent.blur(picker("Material, Line 1"));
    expect(optionsOf(lineField("Unit", 1))).toEqual([]);
  });

  it("refuses typed text that names no material, so no line takes it (#217)", () => {
    renderForm();
    choose("Material, Line 1", "00000002");

    fireEvent.change(picker("Material, Line 1"), { target: { value: "Bolt M9" } });
    expect(screen.getByRole("listbox", { name: "Material, Line 1" }).textContent).toBe("No material matches “Bolt M9”.");
    fireEvent.blur(picker("Material, Line 1"));

    expect(screen.getByText("Choose a material from the list.")).toBeTruthy();
    expect(picker("Material, Line 1").getAttribute("aria-invalid")).toBe("true");
    expect(optionsOf(lineField("Unit", 1))).toEqual([]);
    expect(screen.getByRole("button", { name: "Remove this line" })).toBeTruthy();
  });

  it("removes the right line, named by its material, keeping the others' typed text", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "+ Add component" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add component" }));
    setLine(1, "00000002", "1");
    setLine(2, "00000003", "2");
    setLine(3, "00000002", "3");

    fireEvent.click(screen.getAllByRole("button", { name: "Remove 00000002 — Bolt M8" })[0]);

    expect((lineField("Quantity", 1) as HTMLInputElement).value).toBe("2");
    expect((lineField("Quantity", 2) as HTMLInputElement).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "+ Add component" }));
    expect(screen.getByRole("button", { name: "Remove this line" })).toBeTruthy();
  });

  it("names every invalid field before sending, a line's under that line (spec Q5)", () => {
    renderForm();
    setLine(1, "00000002", "0");
    fireEvent.click(screen.getByRole("button", { name: "+ Add component" }));
    setLine(2, "00000002", "1");
    change("Valid from", "2027-02-01");
    change("Valid through", "2027-01-01");
    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));

    expect(screen.getByText("Choose the material this BOM makes.")).toBeTruthy();
    expect(screen.getByText("Enter a whole number from 1 to 999; 1 is the highest.")).toBeTruthy();
    expect(screen.getByText("Valid through can't be before valid from.")).toBeTruthy();
    expect(screen.getByText(/^Enter a number greater than 0/)).toBeTruthy();
    expect(screen.getByText("This material is already in the BOM: enter its total quantity once.")).toBeTruthy();
    expect(lineField("Quantity", 1).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/^Enter a number greater than 0/).id).toBe(lineField("Quantity", 1).getAttribute("aria-describedby"));
    // A field error is icon + text in the danger tone, as in CrudForm.
    const note = screen.getByText("Choose the material this BOM makes.");
    expect(note.className).toContain("text-danger");
    expect(note.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(action).not.toHaveBeenCalled();
  });

  it("asks for a line when the last one is removed", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Remove this line" }));
    choose("Output", "00000005");
    change("Priority", "1");
    change("Valid from", "2027-01-01");
    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));

    expect(screen.getByText("Add at least 1 and at most 100 components.")).toBeTruthy();
  });

  it("puts the server's line errors on their lines, and shows other errors above the buttons, translated", async () => {
    renderForm({ labels: bomsLabels(pl), submitLabel: "Utwórz BOM" });
    choose("Wyrób", "00000005");
    fireEvent.change(screen.getByLabelText("Priorytet"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Ważny od"), { target: { value: "2027-01-01" } });
    choose("Materiał, Wiersz 1", "00000002");
    fireEvent.change(screen.getByLabelText("Ilość, Wiersz 1"), { target: { value: "0.0000001" } });

    action.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { "components.0.unit": ["This material has no conversion from this unit to its base unit."] } },
    });
    fireEvent.change(screen.getByLabelText("Ilość, Wiersz 1"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Utwórz BOM" }));
    expect(await screen.findByText(pl.boms.fieldErrors.unitNotConvertible)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    action.mockResolvedValueOnce({ ok: false, error: { code: "BOM_CYCLE", message: "This recipe would make a cycle: 00000005 C → 00000005 C." } });
    fireEvent.click(screen.getByRole("button", { name: "Utwórz BOM" }));
    expect((await screen.findByRole("alert")).textContent).toBe(`${pl.boms.errors.BOM_CYCLE} 00000005 C → 00000005 C.`);

    action.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { elsewhere: ["?"] } } });
    fireEvent.click(screen.getByRole("button", { name: "Utwórz BOM" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pl.errors.VALIDATION_FAILED));

    action.mockResolvedValueOnce({ ok: false, error: { code: "INTERNAL", message: "Boom." } });
    fireEvent.click(screen.getByRole("button", { name: "Utwórz BOM" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(pl.errors.INTERNAL));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a schema's field issues and leaves an issue about the whole form to the server", () => {
    const issues = [
      { path: [], message: "The whole form." },
      { path: ["priority"], message: "Priority first." },
      { path: ["priority"], message: "Priority second." },
    ];
    renderForm({ schema: { safeParse: () => ({ success: false, error: { issues } }) } });
    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));

    expect(screen.getByText("Priority first.")).toBeTruthy();
    expect(screen.queryByText("Priority second.")).toBeNull();
    expect(screen.queryByText("The whole form.")).toBeNull();
  });

  it("clears line errors when lines are removed or added, so none lands on the wrong row", async () => {
    action.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { "components.1.unit": ["This material has no conversion from this unit to its base unit."] } },
    });
    renderForm({ schema: { safeParse: () => ({ success: true }) } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add component" }));
    setLine(1, "00000002", "1");
    setLine(2, "00000003", "2");
    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));
    expect(await screen.findByText("This material has no conversion from this unit to its base unit.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove 00000002 — Bolt M8" }));
    expect(screen.queryByText("This material has no conversion from this unit to its base unit.")).toBeNull();
  });

  it("starts an edit from the current revision as entered, keeping a unit whose conversion was removed (spec Q12)", async () => {
    action.mockResolvedValue({ ok: true, data: { id: "00000002" } });
    renderForm({
      outputs: undefined,
      output: { description: "Cabinet, red", baseUnit: "each" },
      schema: bomRecipeFormSchema,
      submitLabel: "Save",
      initial: {
        priority: "1",
        validFrom: "2026-01-01",
        validThrough: "2026-12-31",
        components: [
          { material: "00000002", quantity: "2", unit: "pallet" },
          { material: "00000003", quantity: "0.25", unit: "l" },
        ],
      },
    });

    expect(screen.queryByRole("combobox", { name: "Output" })).toBeNull();
    expect((picker("Material, Line 1") as HTMLInputElement).value).toBe("00000002 — Bolt M8");
    expect(screen.getByText("Per 1 each of Cabinet, red")).toBeTruthy();
    expect((screen.getByLabelText("Valid through") as HTMLInputElement).value).toBe("2026-12-31");
    expect(optionsOf(lineField("Unit", 1))).toEqual(["each", "case", "pallet"]);
    expect(optionsOf(lineField("Unit", 2))).toEqual(["l", "ml"]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(action.mock.calls[0][0].components[0]).toEqual({ material: "00000002", quantity: "2", unit: "pallet" });
  });

  it("submits with Cmd/Ctrl+Enter, shows its pending label, and cancels with Escape or Cancel", async () => {
    let finish: (value: unknown) => void = () => {};
    action.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderForm({ schema: { safeParse: () => ({ success: true }) } });

    fireEvent.keyDown(screen.getByLabelText("Priority"), { key: "Enter", ctrlKey: true });
    expect(await screen.findByRole("button", { name: "Creating…" })).toBeTruthy();
    finish({ ok: true, data: { id: "00000001" } });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    fireEvent.keyDown(screen.getByLabelText("Priority"), { key: "Enter", metaKey: true });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(screen.getByLabelText("Priority"), { key: "Enter" });
    expect(action).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(screen.getByLabelText("Priority"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("leaves Escape to an open material list, which closes only the list (#217)", () => {
    renderForm();
    fireEvent.change(picker("Material, Line 1"), { target: { value: "Bolt" } });
    expect(picker("Material, Line 1").getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(picker("Material, Line 1"), { key: "Escape" });
    expect(picker("Material, Line 1").getAttribute("aria-expanded")).toBe("false");
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.keyDown(picker("Material, Line 1"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
