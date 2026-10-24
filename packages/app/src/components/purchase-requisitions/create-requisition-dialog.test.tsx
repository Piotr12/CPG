import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { CreateRequisitionDialog } from "./create-requisition-dialog";
import { requisitionsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createRequisition: vi.fn() }));
vi.mock("../../app/admin/[tenant]/purchase-requisitions/actions", () => ({ createRequisition: mocks.createRequisition }));

const materials = [{ value: "00000001", code: "00000001", name: "Steel", detail: "kg", units: ["kg", "t"] }];
const locations = [{ value: "00000001", label: "00000001 — Main plant" }];
const dialog = () => (
  <CreateRequisitionDialog context={{ tenant: "prod", generation: 1 }} labels={requisitionsLabels(en)} materials={materials} locations={locations} locale="en" />
);

describe("CreateRequisitionDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a requisition in the page's tenant and generation, and closes (LFC-001)", async () => {
    mocks.createRequisition.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create requisition" }));
    expect(screen.getByRole("dialog", { name: "Create a purchase requisition" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Material" }), { target: { value: "steel" } });
    fireEvent.mouseDown(within(screen.getByRole("listbox")).getByRole("option"));
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "00000001" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Required by"), { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Create requisition" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createRequisition).toHaveBeenCalledWith("prod", 1, {
      material: "00000001",
      location: "00000001",
      quantity: "100",
      unit: "kg",
      requiredDate: "2027-03-01",
    });
  });

  it("closes on Cancel without sending", () => {
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create requisition" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createRequisition).not.toHaveBeenCalled();
  });
});
