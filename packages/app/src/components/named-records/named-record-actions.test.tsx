import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { namedRecordsLabels } from "./labels";
import { NamedRecordActions } from "./named-record-actions";

beforeAll(() => {
  // Radix positions menus with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const context = { tenant: "test", generation: 1 };
const site = { id: "00000002", name: "Poznań warehouse", active: true, createdAt: new Date(), version: 3 };
const labels = namedRecordsLabels(en, "locations");
const update = vi.fn();

function open(item: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions for 00000002" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

describe("NamedRecordActions", () => {
  afterEach(() => vi.clearAllMocks());

  it("offers Edit and Deactivate for an active record, Edit and Reactivate for an inactive one", () => {
    const { rerender } = render(<NamedRecordActions record={site} context={context} labels={labels} update={update} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for 00000002" }), { key: "Enter" });
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Deactivate"]);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    rerender(<NamedRecordActions record={{ ...site, active: false }} context={context} labels={labels} update={update} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for 00000002" }), { key: "Enter" });
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "Reactivate"]);
  });

  it("renames from a form prefilled with the name, at the loaded version", async () => {
    update.mockResolvedValue({ ok: true, data: { ...site, name: "Poznań DC", version: 4 } });
    render(<NamedRecordActions record={site} context={context} labels={labels} update={update} />);

    open("Edit");
    expect(screen.getByRole("dialog", { name: "Edit location 00000002" })).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Poznań warehouse");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Poznań DC" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(update).toHaveBeenCalledWith("test", 1, "00000002", 3, { name: "Poznań DC" });
  });

  it("deactivates after a destructive confirmation that says what inactive means (LFC-019)", async () => {
    update.mockResolvedValue({ ok: true, data: { ...site, active: false } });
    render(<NamedRecordActions record={site} context={context} labels={labels} update={update} />);

    open("Deactivate");
    const dialog = screen.getByRole("alertdialog", { name: "Deactivate location 00000002?" });
    expect(dialog.textContent).toContain("can't be picked for new entries");
    const confirm = screen.getByRole("button", { name: "Deactivate" });
    expect(confirm.dataset.variant).toBe("destructive-solid");
    await act(async () => fireEvent.click(confirm));

    expect(update).toHaveBeenCalledWith("test", 1, "00000002", 3, { active: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("reactivates an inactive record, and keeps that action when a stale version refreshes the row", async () => {
    update.mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "x" } });
    const inactive = { ...site, active: false };
    const { rerender } = render(<NamedRecordActions record={inactive} context={context} labels={labels} update={update} />);

    open("Reactivate");
    const confirm = screen.getByRole("button", { name: "Reactivate" });
    expect(confirm.dataset.variant).not.toBe("destructive-solid");
    await act(async () => fireEvent.click(confirm));
    // The page re-renders with what another tab saved: already active, at a newer version.
    rerender(<NamedRecordActions record={{ ...site, version: 4 }} context={context} labels={labels} update={update} />);

    expect(update).toHaveBeenCalledWith("test", 1, "00000002", 3, { active: true });
    expect(screen.getByRole("alertdialog", { name: "Reactivate location 00000002?" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("This location was changed since you loaded the page. Check it and try again.");
  });

  it("closes the edit form on cancel without writing", () => {
    render(<NamedRecordActions record={site} context={context} labels={labels} update={update} />);

    open("Edit");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
