import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { ReadOnlyControls } from "./read-only-controls";
import { readOnlyControlsLabels } from "./read-only-labels";

const mocks = vi.hoisted(() => ({ setTenantReadOnly: vi.fn() }));
vi.mock("../../app/admin/(global)/actions", () => ({ setTenantReadOnly: mocks.setTenantReadOnly }));

const labels = readOnlyControlsLabels(en, "Prod");

describe("ReadOnlyControls", () => {
  afterEach(() => vi.clearAllMocks());

  it("makes a writable tenant read-only after a destructive confirmation (R05)", async () => {
    mocks.setTenantReadOnly.mockResolvedValue({ ok: true, data: { code: "prod", readOnly: true } });
    render(<ReadOnlyControls tenant="prod" readOnly={false} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Make Prod read-only" }));
    const dialog = screen.getByRole("alertdialog", { name: "Make Prod read-only?" });
    expect(dialog.textContent).toContain("Nobody, the administrator included, can change Prod's business data");
    fireEvent.click(screen.getByRole("button", { name: "Make read-only" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.setTenantReadOnly).toHaveBeenCalledWith({ tenant: "prod", readOnly: true });
  });

  it("makes a read-only tenant writable again", async () => {
    mocks.setTenantReadOnly.mockResolvedValue({ ok: true, data: { code: "prod", readOnly: false } });
    render(<ReadOnlyControls tenant="prod" readOnly={true} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Make Prod writable" }));
    fireEvent.click(screen.getByRole("button", { name: "Make writable" }));

    await waitFor(() => expect(mocks.setTenantReadOnly).toHaveBeenCalledWith({ tenant: "prod", readOnly: false }));
  });

  it("keeps the direction chosen when the confirmation opened, even if the page refreshes under it", async () => {
    mocks.setTenantReadOnly.mockResolvedValue({ ok: false, error: { code: "INTERNAL", message: "x" } });
    const { rerender } = render(<ReadOnlyControls tenant="prod" readOnly={false} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Make Prod read-only" }));
    rerender(<ReadOnlyControls tenant="prod" readOnly={true} labels={labels} />);
    expect(screen.getByRole("alertdialog", { name: "Make Prod read-only?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Make read-only" }));

    await waitFor(() => expect(mocks.setTenantReadOnly).toHaveBeenCalledWith({ tenant: "prod", readOnly: true }));
  });

  it("shows a refusal in the reader's language and keeps the dialog open", async () => {
    mocks.setTenantReadOnly.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "server text" } });
    render(<ReadOnlyControls tenant="prod" readOnly={false} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Make Prod read-only" }));
    fireEvent.click(screen.getByRole("button", { name: "Make read-only" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Only the administrator can change the read-only flags.");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});
