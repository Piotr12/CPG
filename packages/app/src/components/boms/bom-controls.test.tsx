import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BomView } from "@cpg/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { BomControls } from "./bom-controls";
import { bomsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ updateBomRecipe: vi.fn(), setBomActive: vi.fn() }));
vi.mock("../../app/admin/[tenant]/boms/actions", () => mocks);

const context = { tenant: "test", generation: 1 };
const choices = [{ value: "00000002", label: "00000002 — Bolt M8 (each)", units: ["each", "case"] }];
const bom: BomView = {
  id: "00000003",
  output: "00000005",
  active: true,
  revision: 2,
  priority: 2,
  validFrom: "2026-01-01",
  validThrough: null,
  components: [{ material: "00000002", quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case", numerator: "12", denominator: "1" }],
  createdAt: new Date("2026-10-20T08:00:00Z"),
  version: 5,
};
const controls = (overrides: Partial<BomView> = {}) => (
  <BomControls bom={{ ...bom, ...overrides }} output={{ description: "Cabinet, red", baseUnit: "each" }} context={context} labels={bomsLabels(en)} choices={choices} />
);

describe("BomControls", () => {
  afterEach(() => vi.clearAllMocks());

  it("edits the recipe from a form prefilled as entered, at the loaded version (BOM-020)", async () => {
    mocks.updateBomRecipe.mockResolvedValue({ ok: true, data: { ...bom, revision: 3 } });
    render(controls());

    fireEvent.click(screen.getByRole("button", { name: "Edit recipe" }));
    expect(screen.getByRole("dialog", { name: "Edit the recipe of BOM 00000003" })).toBeTruthy();
    expect(screen.getByText("Saving a change creates revision 3. Saving the same recipe changes nothing.")).toBeTruthy();
    expect((screen.getByLabelText("Quantity, Line 1") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Unit, Line 1") as HTMLSelectElement).value).toBe("case");
    expect((screen.getByLabelText("Valid through") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Quantity, Line 1"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.updateBomRecipe).toHaveBeenCalledWith("test", 1, "00000003", 5, {
      priority: "2",
      validFrom: "2026-01-01",
      validThrough: "",
      components: [{ material: "00000002", quantity: "3", unit: "case" }],
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says when a save changed nothing, until the form opens again (BOM-023)", async () => {
    mocks.updateBomRecipe.mockResolvedValue({ ok: true, data: bom });
    render(controls({ validThrough: "2026-12-31" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit recipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("status")).textContent).toBe("No change: revision 2 is still current.");
    fireEvent.click(screen.getByRole("button", { name: "Edit recipe" }));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deactivates an active BOM after a destructive confirmation (BOM-022)", async () => {
    mocks.setBomActive.mockResolvedValue({ ok: true, data: { ...bom, active: false } });
    render(controls());

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByRole("alertdialog", { name: "Deactivate BOM 00000003?" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" }).at(-1)!);

    await waitFor(() => expect(mocks.setBomActive).toHaveBeenCalledWith("test", 1, "00000003", 5, false));
  });

  it("reactivates an inactive BOM, showing a priority clash with its details (BOM-030)", async () => {
    mocks.setBomActive.mockResolvedValue({
      ok: false,
      error: { code: "BOM_PRIORITY_CONFLICT", message: "Another active BOM for this output has the same priority on some of these days: BOM 00000002 (2026-01-01 – …)." },
    });
    render(controls({ active: false }));

    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Reactivate" }).at(-1)!);

    expect((await screen.findByRole("alert")).textContent).toBe(`${en.boms.errors.BOM_PRIORITY_CONFLICT} BOM 00000002 (2026-01-01 – …).`);
    expect(mocks.setBomActive).toHaveBeenCalledWith("test", 1, "00000003", 5, true);
  });
});
