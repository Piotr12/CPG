import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { AddPlanningParametersDialog } from "./add-planning-parameters-dialog";
import { planningParametersLabels } from "./labels";

const mocks = vi.hoisted(() => ({ addPlanningParameters: vi.fn() }));
vi.mock("../../app/admin/[tenant]/planning-parameters/actions", () => ({ addPlanningParameters: mocks.addPlanningParameters }));

const labels = planningParametersLabels(en);
const materials = [{ value: "00000001", label: "00000001 — Bolt M8 (each)" }];
const locations = [{ value: "00000001", label: "00000001 — Main plant" }];
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("AddPlanningParametersDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds the chosen material and location's values in the bound tenant and generation (MAT-016)", async () => {
    mocks.addPlanningParameters.mockResolvedValue({ ok: true, data: {} });
    render(<AddPlanningParametersDialog context={{ tenant: "prod", generation: 1 }} labels={labels} materials={materials} locations={locations} />);

    fireEvent.click(screen.getByRole("button", { name: "Add parameters" }));
    // Six fields with hints are taller than a laptop window: the dialog scrolls instead of hiding its buttons.
    expect(screen.getByRole("dialog", { name: "Add planning parameters" }).className).toContain("overflow-y-auto");
    fill("Material", "00000001");
    fill("Location", "00000001");
    fill("Make / Buy", "buy");
    fill("Lead time (days)", "7");
    fill("Minimum lot", "1000");
    fill("Lot multiple", "100");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.addPlanningParameters).toHaveBeenCalledWith("prod", 1, {
      material: "00000001",
      location: "00000001",
      procurement: "buy",
      leadTimeDays: "7",
      minimumQuantity: "1000",
      lotMultiple: "100",
    });
  });

  it("shows the raw-material refusal next to Make/Buy (MAT-014), and closes on Cancel", async () => {
    mocks.addPlanningParameters.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "x", fieldErrors: { procurement: ["A raw material is always bought: choose Buy."] } },
    });
    render(<AddPlanningParametersDialog context={{ tenant: "prod", generation: 1 }} labels={labels} materials={materials} locations={locations} />);

    fireEvent.click(screen.getByRole("button", { name: "Add parameters" }));
    fill("Material", "00000001");
    fill("Location", "00000001");
    fill("Make / Buy", "make");
    fill("Lead time (days)", "7");
    fill("Minimum lot", "0");
    fill("Lot multiple", "1");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));

    expect(screen.getByText("A raw material is always bought: choose Buy.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
