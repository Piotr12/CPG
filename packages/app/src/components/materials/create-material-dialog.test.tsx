import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CreateMaterialDialog } from "./create-material-dialog";
import { unitChoices } from "../units/unit-choices";
import { materialsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createMaterial: vi.fn() }));
vi.mock("../../app/admin/[tenant]/materials/actions", () => ({ createMaterial: mocks.createMaterial }));

const context = { tenant: "prod", generation: 1 };
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getAllByRole("button", { name: "Create material" }).at(-1)!);


/** A field's tooltip as a screen reader gets it: its info button's description (UX-014, #290). */
const tip = (name: string) => {
  const button = screen.getByRole("button", { name });
  return document.getElementById(button.getAttribute("aria-describedby")!)!.textContent;
};
describe("CreateMaterialDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a material in the page's tenant and generation, and closes (MAT-001)", async () => {
    mocks.createMaterial.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    render(<CreateMaterialDialog context={context} labels={materialsLabels(en)} units={unitChoices("en", en.units)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create material" }));
    expect(screen.getByRole("dialog", { name: "Create material" })).toBeTruthy();
    const type = screen.getByLabelText("Type") as HTMLSelectElement;
    expect([...type.options].map((option) => option.textContent)).toEqual(["Choose a type", "Raw", "Intermediate", "Finished"]);
    // The base unit is chosen from the registry, grouped by dimension (#217), never the report-only SU (#239).
    const unit = screen.getByLabelText("Base unit") as HTMLSelectElement;
    expect(unit.options[0].textContent).toBe("Choose a unit");
    // Base unit's tooltip says what it stores and when it locks (UX-014, R02, #290).
    expect(tip("About Base unit")).toBe(en.materials.form.baseUnitTip);
    expect(tip("About Base unit")).toContain("stored in this unit, exactly to six decimals");
    expect([...unit.querySelectorAll("optgroup")].map((group) => group.label)).toEqual(["Count", "Packaging", "Mass", "Volume", "Length", "Area", "Time"]);
    expect([...unit.options].map((option) => option.value)).not.toContain("SU");
    expect([...unit.querySelectorAll("optgroup[label=Mass] option")].map((option) => option.textContent)).toEqual([
      "mg — milligram",
      "g — gram",
      "kg — kilogram",
      "t — tonne",
    ]);
    expect(screen.getByText("Every quantity of this material is stored in this unit, exactly to six decimals.")).toBeTruthy();
    change("Type", "finished");
    change("Description", "Cabinet, red");
    change("Base unit", "each");
    submit();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createMaterial).toHaveBeenCalledWith("prod", 1, { type: "finished", description: "Cabinet, red", baseUnit: "each" });
  });

  it("names every missing field before sending anything (MAT-005, MAT-008)", () => {
    render(<CreateMaterialDialog context={context} labels={materialsLabels(en)} units={unitChoices("en", en.units)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create material" }));
    submit();

    expect(screen.getByText("Choose raw, intermediate or finished.")).toBeTruthy();
    expect(screen.getByText("Enter a description.")).toBeTruthy();
    expect(screen.getByText("Choose a unit from the list.")).toBeTruthy();
    expect(mocks.createMaterial).not.toHaveBeenCalled();
  });

  it("closes on cancel, and speaks Polish, a refused write included", async () => {
    mocks.createMaterial.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "You don't have access to this." } });
    render(<CreateMaterialDialog context={context} labels={materialsLabels(pl)} units={unitChoices("pl", pl.units)} />);

    fireEvent.click(screen.getByRole("button", { name: "Utwórz materiał" }));
    expect(tip("Informacje o polu Jednostka bazowa")).toBe(pl.materials.form.baseUnitTip);
    change("Typ", "raw");
    change("Opis", "Śruba");
    change("Jednostka bazowa", "pcs");
    expect(screen.getByRole("option", { name: "pcs — sztuka" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Utwórz materiał" }).at(-1)!);

    expect((await screen.findByRole("alert")).textContent).toBe("Tylko administrator może zmieniać materiały.");
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
