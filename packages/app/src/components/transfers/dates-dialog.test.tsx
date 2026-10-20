import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { DatesDialog } from "./dates-dialog";
import { transfersLabels } from "./labels";

const mocks = vi.hoisted(() => ({ dispatchTransfer: vi.fn(), receiveTransfer: vi.fn(), writeOffTransfer: vi.fn(), setTransferDates: vi.fn() }));
vi.mock("../../app/admin/[tenant]/transfers/[id]/actions", () => mocks);

const TRANSFER = { id: "00000004", plannedDispatch: "2027-03-01", plannedArrival: "2027-03-03", version: 2 };
const dialog = (transfer = TRANSFER) => <DatesDialog context={{ tenant: "test", generation: 3 }} transfer={transfer} labels={transfersLabels(en)} />;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(() => vi.clearAllMocks());

describe("DatesDialog", () => {
  it("prefills the planned dates and saves new ones at the version the page loaded (TRF-026)", async () => {
    mocks.setTransferDates.mockResolvedValue({ ok: true, data: {} });
    render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Change dates" }));
    expect((screen.getByLabelText("Planned dispatch") as HTMLInputElement).value).toBe("2027-03-01");
    expect((screen.getByLabelText("Planned arrival") as HTMLInputElement).value).toBe("2027-03-03");
    change("Planned arrival", "2027-03-05");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.setTransferDates).toHaveBeenCalledWith("test", 3, "00000004", 2, { plannedDispatch: "2027-03-01", plannedArrival: "2027-03-05" });
  });

  it("refuses an arrival before the dispatch, and keeps the version it opened with until it is reopened", async () => {
    mocks.setTransferDates.mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "Changed." } });
    const { rerender } = render(dialog());

    fireEvent.click(screen.getByRole("button", { name: "Change dates" }));
    change("Planned arrival", "2027-02-01");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(en.transfers.fieldErrors.arrivalBeforeDispatch)).toBeTruthy();
    expect(mocks.setTransferDates).not.toHaveBeenCalled();

    change("Planned arrival", "2027-03-04");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByRole("alert").textContent).toBe(en.transfers.errors.VERSION_CONFLICT);
    // The refreshed page hands a newer version; the open dialog still saves against the one it showed.
    rerender(dialog({ ...TRANSFER, version: 3 }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(mocks.setTransferDates).toHaveBeenLastCalledWith("test", 3, "00000004", 2, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Change dates" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(mocks.setTransferDates).toHaveBeenLastCalledWith("test", 3, "00000004", 3, { plannedDispatch: "2027-03-01", plannedArrival: "2027-03-03" });
  });
});
