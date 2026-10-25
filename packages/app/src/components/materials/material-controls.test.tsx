import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { unitChoices } from "../units/unit-choices";
import { materialsLabels } from "./labels";
import { MaterialControls } from "./material-controls";

const mocks = vi.hoisted(() => ({ updateMaterial: vi.fn() }));
vi.mock("../../app/admin/[tenant]/materials/actions", () => ({ updateMaterial: mocks.updateMaterial }));

const context = { tenant: "test", generation: 1 };
const units = unitChoices("en", en.units);
const bolt = {
  id: "00000002",
  type: "raw" as const,
  description: "Bolt M8",
  baseUnit: "each",
  active: true,
  createdAt: new Date("2026-10-19T19:00:00Z"),
  version: 3,
};

describe("MaterialControls", () => {
  afterEach(() => vi.clearAllMocks());

  it("edits the material from a form prefilled with it, at the loaded version", async () => {
    mocks.updateMaterial.mockResolvedValue({ ok: true, data: { ...bolt, version: 4 } });
    render(<MaterialControls material={bolt} context={context} labels={materialsLabels(en)} units={units} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit 00000002" })).toBeTruthy();
    expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe("raw");
    expect((screen.getByLabelText("Base unit") as HTMLInputElement).value).toBe("each");
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Bolt M8 × 40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.updateMaterial).toHaveBeenCalledWith("test", 1, "00000002", 3, {
      type: "raw",
      description: "Bolt M8 × 40",
      baseUnit: "each",
    });
  });

  it("shows a conflict in the edit form and closes it on cancel", async () => {
    mocks.updateMaterial.mockResolvedValue({ ok: false, error: { code: "BASE_UNIT_HAS_CONVERSIONS", message: "x" } });
    render(<MaterialControls material={bolt} context={context} labels={materialsLabels(en)} units={units} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Base unit"), { target: { value: "pcs" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/^Remove the unit conversions/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deactivates an active material after a destructive confirmation (AUD-003)", async () => {
    mocks.updateMaterial.mockResolvedValue({ ok: true, data: { ...bolt, active: false } });
    render(<MaterialControls material={bolt} context={context} labels={materialsLabels(en)} units={units} />);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByRole("alertdialog", { name: "Deactivate 00000002?" })).toBeTruthy();
    const confirm = screen.getAllByRole("button", { name: "Deactivate" }).at(-1)!;
    expect(confirm.dataset.variant).toBe("destructive-solid");
    await act(async () => fireEvent.click(confirm));

    expect(mocks.updateMaterial).toHaveBeenCalledWith("test", 1, "00000002", 3, { active: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps the action it opened with when a stale version refreshes the material underneath", async () => {
    mocks.updateMaterial.mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "x" } });
    const { rerender } = render(<MaterialControls material={bolt} context={context} labels={materialsLabels(en)} units={units} />);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" }).at(-1)!));
    // The page re-renders with what another tab saved: already inactive, at a newer version.
    rerender(<MaterialControls material={{ ...bolt, active: false, version: 4 }} context={context} labels={materialsLabels(en)} units={units} />);

    expect(screen.getByRole("alertdialog", { name: "Deactivate 00000002?" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("This material was changed since you loaded the page. Check it and try again.");
    mocks.updateMaterial.mockResolvedValue({ ok: true, data: { ...bolt, active: false } });
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Deactivate" }).at(-1)!));

    expect(mocks.updateMaterial).toHaveBeenLastCalledWith("test", 1, "00000002", 4, { active: false });
  });

  it("reactivates an inactive one", async () => {
    mocks.updateMaterial.mockResolvedValue({ ok: true, data: bolt });
    render(<MaterialControls material={{ ...bolt, active: false }} context={context} labels={materialsLabels(en)} units={units} />);

    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Reactivate" }).at(-1)!));

    expect(mocks.updateMaterial).toHaveBeenCalledWith("test", 1, "00000002", 3, { active: true });
  });

  it("keeps a base unit stored before the unit list, first and selected, so saving other fields keeps it (#217)", async () => {
    mocks.updateMaterial.mockResolvedValue({ ok: true, data: bolt });
    render(<MaterialControls material={{ ...bolt, baseUnit: "płyta" }} context={context} labels={materialsLabels(en)} units={units} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const unit = screen.getByLabelText("Base unit") as HTMLSelectElement;
    expect(unit.value).toBe("płyta");
    expect(unit.options[1].textContent).toBe("płyta (not in the unit list)");
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Board" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    expect(mocks.updateMaterial).toHaveBeenCalledWith("test", 1, "00000002", 3, { type: "raw", description: "Board", baseUnit: "płyta" });
  });

  it("keeps a stored base unit SU first and selected, though the select offers no statistical unit (#239)", async () => {
    mocks.updateMaterial.mockResolvedValue({ ok: true, data: bolt });
    render(<MaterialControls material={{ ...bolt, baseUnit: "SU" }} context={context} labels={materialsLabels(en)} units={units} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const unit = screen.getByLabelText("Base unit") as HTMLSelectElement;
    expect(unit.value).toBe("SU");
    expect(unit.options[1].textContent).toBe("SU — statistical unit");
    expect([...unit.options].filter((option) => option.value === "SU")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Kit" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    expect(mocks.updateMaterial).toHaveBeenCalledWith("test", 1, "00000002", 3, { type: "raw", description: "Kit", baseUnit: "SU" });
  });
});
