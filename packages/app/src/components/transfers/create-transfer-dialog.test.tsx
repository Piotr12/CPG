import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { CreateTransferDialog } from "./create-transfer-dialog";
import { transfersLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createTransfer: vi.fn() }));
vi.mock("../../app/admin/[tenant]/transfers/actions", () => ({ createTransfer: mocks.createTransfer }));

const materials = [{ value: "00000001", code: "00000001", name: "Steel", detail: "kg", units: ["kg", "t"] }];
const locations = [
  { value: "00000001", code: "00000001", name: "Main plant" },
  { value: "00000002", code: "00000002", name: "Warehouse" },
];
const dialog = () => <CreateTransferDialog context={{ tenant: "prod", generation: 1 }} labels={transfersLabels(en)} materials={materials} locations={locations} locale="en" />;

describe("CreateTransferDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a transfer in the page's tenant and generation, and closes (LFC-001)", async () => {
    mocks.createTransfer.mockResolvedValue({ ok: true, data: { id: "00000001" } });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create transfer" }));
    expect(screen.getByRole("dialog", { name: "Create a transfer" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Material" }), { target: { value: "steel" } });
    fireEvent.mouseDown(within(screen.getByRole("listbox")).getByRole("option"));
    const choose = (label: string, typed: string) => {
      fireEvent.change(screen.getByRole("combobox", { name: label }), { target: { value: typed } });
      fireEvent.mouseDown(within(screen.getByRole("listbox", { name: label })).getByRole("option"));
    };
    choose("From", "plant");
    choose("To", "warehouse");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Planned dispatch"), { target: { value: "2027-03-01" } });
    fireEvent.change(screen.getByLabelText("Planned arrival"), { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Create transfer" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createTransfer).toHaveBeenCalledWith("prod", 1, {
      material: "00000001", source: "00000001", destination: "00000002", quantity: "100", unit: "kg", plannedDispatch: "2027-03-01", plannedArrival: "2027-03-01",
    });
  });

  it("closes on Cancel without sending", () => {
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Create transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createTransfer).not.toHaveBeenCalled();
  });
});
