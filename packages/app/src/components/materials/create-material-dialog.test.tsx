import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CreateMaterialDialog } from "./create-material-dialog";
import { materialsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createMaterial: vi.fn() }));
vi.mock("../../app/admin/[tenant]/materials/actions", () => ({ createMaterial: mocks.createMaterial }));

const context = { tenant: "prod", generation: 1 };
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getAllByRole("button", { name: "Create material" }).at(-1)!);

describe("CreateMaterialDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a material in the page's tenant and generation, and closes (MAT-001)", async () => {
    mocks.createMaterial.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    render(<CreateMaterialDialog context={context} labels={materialsLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create material" }));
    expect(screen.getByRole("dialog", { name: "Create material" })).toBeTruthy();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Choose a type",
      "Raw",
      "Intermediate",
      "Finished",
    ]);
    change("Type", "finished");
    change("Description", "Cabinet, red");
    change("Base unit", "each");
    submit();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createMaterial).toHaveBeenCalledWith("prod", 1, { type: "finished", description: "Cabinet, red", baseUnit: "each" });
  });

  it("names every missing field before sending anything (MAT-005, MAT-008)", () => {
    render(<CreateMaterialDialog context={context} labels={materialsLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create material" }));
    submit();

    expect(screen.getByText("Choose raw, intermediate or finished.")).toBeTruthy();
    expect(screen.getByText("Enter a description.")).toBeTruthy();
    expect(screen.getByText(/^Use 1–16 letters/)).toBeTruthy();
    expect(mocks.createMaterial).not.toHaveBeenCalled();
  });

  it("closes on cancel, and speaks Polish, a refused write included", async () => {
    mocks.createMaterial.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "You don't have access to this." } });
    render(<CreateMaterialDialog context={context} labels={materialsLabels(pl)} />);

    fireEvent.click(screen.getByRole("button", { name: "Utwórz materiał" }));
    change("Typ", "raw");
    change("Opis", "Śruba");
    change("Jednostka bazowa", "szt.");
    fireEvent.click(screen.getAllByRole("button", { name: "Utwórz materiał" }).at(-1)!);

    expect((await screen.findByRole("alert")).textContent).toBe("Tylko administrator może zmieniać materiały.");
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
