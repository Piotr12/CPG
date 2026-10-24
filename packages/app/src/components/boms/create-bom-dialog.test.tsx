import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { CreateBomDialog } from "./create-bom-dialog";
import { bomsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createBom: vi.fn() }));
vi.mock("../../app/admin/[tenant]/boms/actions", () => ({ createBom: mocks.createBom }));

const outputs = [{ value: "00000005", code: "00000005", name: "Cabinet, red", detail: "each", baseUnit: "each" }];
const choices = [{ value: "00000002", code: "00000002", name: "Bolt M8", detail: "each", units: ["each", "case"] }];
const dialog = () => <CreateBomDialog context={{ tenant: "prod", generation: 1 }} labels={bomsLabels(en)} outputs={outputs} choices={choices} locale="en" />;
/** Chooses `code` in a material picker: types it, then clicks its row. */
const choose = (name: string, code: string) => {
  fireEvent.change(screen.getByRole("combobox", { name }), { target: { value: code } });
  fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(`^${code}`) }));
};

describe("CreateBomDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a BOM in the page's tenant and generation, and closes (BOM-001)", async () => {
    mocks.createBom.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));
    expect(screen.getByRole("dialog", { name: "Create BOM" })).toBeTruthy();
    choose("Output", "00000005");
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Valid from"), { target: { value: "2027-01-01" } });
    choose("Material, Line 1", "00000002");
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
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createBom).not.toHaveBeenCalled();
  });

  it("closes only an open material list on Escape, and the dialog on the next one (#217)", () => {
    render(dialog());
    fireEvent.click(screen.getByRole("button", { name: "Create BOM" }));
    const output = screen.getByRole("combobox", { name: "Output" });
    fireEvent.change(output, { target: { value: "cab" } });
    expect(output.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(output, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Create BOM" })).toBeTruthy();
    expect(output.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(output, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
