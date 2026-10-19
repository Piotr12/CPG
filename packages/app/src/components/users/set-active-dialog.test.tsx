import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetActiveDialog } from "./set-active-dialog";

const mocks = vi.hoisted(() => ({ setUserActive: vi.fn() }));
vi.mock("../../app/admin/users/actions", () => ({ setUserActive: mocks.setUserActive }));

const alice = { id: "b", username: "alice", role: "user" as const, active: true, createdAt: new Date() };

describe("SetActiveDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("confirms a deactivation, saying what it does, then closes", async () => {
    mocks.setUserActive.mockResolvedValue({ ok: true, data: { ...alice, active: false } });
    const onClose = vi.fn();
    render(<SetActiveDialog user={alice} open onClose={onClose} />);

    expect(screen.getByRole("alertdialog", { name: "Deactivate alice?" })).toBeTruthy();
    expect(screen.getByText(/signed out everywhere and can't sign in until reactivated/)).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Deactivate" });
    expect(confirm.dataset.variant).toBe("destructive");
    fireEvent.click(confirm);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.setUserActive).toHaveBeenCalledWith({ userId: "b", active: false });
  });

  it("reactivates, suggesting a reset for a compromised account", async () => {
    mocks.setUserActive.mockResolvedValue({ ok: true, data: alice });
    render(<SetActiveDialog user={{ ...alice, active: false }} open onClose={vi.fn()} />);

    expect(screen.getByRole("alertdialog", { name: "Reactivate alice?" })).toBeTruthy();
    expect(screen.getByText(/current password\. Reset it too if the account may have been compromised/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));

    await waitFor(() => expect(mocks.setUserActive).toHaveBeenCalledWith({ userId: "b", active: true }));
  });

  it("shows a failure and stays open; cancelling clears it", async () => {
    mocks.setUserActive.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "No such user." } });
    const onClose = vi.fn();
    const { rerender } = render(<SetActiveDialog user={alice} open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No such user.");
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<SetActiveDialog user={alice} open onClose={onClose} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears an earlier failure when a retry succeeds", async () => {
    mocks.setUserActive
      .mockResolvedValueOnce({ ok: false, error: { code: "INTERNAL", message: "Something went wrong. Try again." } })
      .mockResolvedValueOnce({ ok: true, data: alice });
    render(<SetActiveDialog user={alice} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
