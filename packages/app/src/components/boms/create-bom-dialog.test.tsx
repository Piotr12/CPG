import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { CreateBomDialog } from "./create-bom-dialog";
import { bomsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createBom: vi.fn() }));
vi.mock("../../app/admin/[tenant]/boms/actions", () => ({ createBom: mocks.createBom }));

const outputs = [{ value: "00000005", label: "00000005 — Cabinet, red (each)", description: "Cabinet, red", baseUnit: "each" }];
const choices = [{ value: "00000002", label: "00000002 — Bolt M8 (each)", units: ["each", "case"] }];

describe("CreateBomDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a BOM in the page's tenant and generation, and closes (BOM-001)", async () => {
    mocks.createBom.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    render(<CreateBomDialog context={{ tenant: "prod", generation: 1 }} labels={bomsLabels(en)} outputs={outputs} choices={choices} />);

    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));
    expect(screen.getByRole("dialog", { name: "Create BOM" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Output"), { target: { value: "00000005" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Valid from"), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText("Material, Line 1"), { target: { value: "00000002" } });
    fireEvent.change(screen.getByLabelText("Quantity, Line 1"), { target: { value: "16" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Create BOM" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createBom).toHaveBeenCalledWith("prod", 1, {
      output: "00000005",
      priority: "1",
      validFrom: "2027-01-01",
      validThrough: "",
      components: [{ material: "00000002", quantity: "16", unit: "each" }],
    });
  });

  it("closes on Cancel without sending", () => {
    render(<CreateBomDialog context={{ tenant: "prod", generation: 1 }} labels={bomsLabels(en)} outputs={outputs} choices={choices} />);

    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createBom).not.toHaveBeenCalled();
  });
});
