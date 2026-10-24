import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { CancelShipmentButton } from "./cancel-shipment-button";
import { shipmentsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ cancelShipment: vi.fn() }));
vi.mock("../../app/admin/[tenant]/shipments/[id]/actions", () => ({ cancelShipment: mocks.cancelShipment }));

const button = (version = 2) => (
  <CancelShipmentButton context={{ tenant: "prod", generation: 4 }} shipment="00000012" customerOrder="00000007" version={version} labels={shipmentsLabels(en)} />
);
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Cancel shipment" }));

describe("CancelShipmentButton", () => {
  afterEach(() => vi.clearAllMocks());

  it("asks first, saying stock and the order don't change, then cancels at the version it opened with and closes (shipment edit spec Q6)", async () => {
    mocks.cancelShipment.mockResolvedValue({ ok: true, data: { id: "00000012", status: "cancelled" } });
    render(button());

    const trigger = screen.getByRole("button", { name: "Cancel shipment…" });
    expect(trigger.getAttribute("data-variant")).toBe("destructive");
    fireEvent.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: "Cancel shipment 00000012?" });
    expect(within(dialog).getByRole("button", { name: "Cancel shipment" }).getAttribute("data-variant")).toBe("destructive-solid");
    expect(dialog.textContent).toContain("It will plan nothing more. Stock and the order are not changed.");
    confirm();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.cancelShipment).toHaveBeenCalledWith("prod", 4, "00000012", "00000007", 2);
  });

  it("keeps the dialog open with a translated refusal, and Keep shipment closes it", async () => {
    mocks.cancelShipment.mockResolvedValue({ ok: false, error: { code: "SHIPMENT_ISSUED", message: "x" } });
    const { rerender } = render(button(2));
    fireEvent.click(screen.getByRole("button", { name: "Cancel shipment…" }));
    rerender(button(3));
    confirm();

    expect(await screen.findByText(en.shipments.errors.SHIPMENT_ISSUED)).toBeTruthy();
    expect(mocks.cancelShipment).toHaveBeenCalledWith("prod", 4, "00000012", "00000007", 2);
    fireEvent.click(screen.getByRole("button", { name: "Keep shipment" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
