import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordDialog } from "./reset-password-dialog";

const mocks = vi.hoisted(() => ({ resetUserPassword: vi.fn() }));
vi.mock("../../app/admin/users/actions", () => ({ resetUserPassword: mocks.resetUserPassword }));

const alice = { id: "b", username: "alice", role: "user" as const, active: true, createdAt: new Date() };

describe("ResetPasswordDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("stays closed until opened", () => {
    render(<ResetPasswordDialog user={alice} open={false} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("warns that the user is signed out, checks the length, then resets and closes", async () => {
    mocks.resetUserPassword.mockResolvedValue({ ok: true, data: alice });
    const onClose = vi.fn();
    render(<ResetPasswordDialog user={alice} open onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Reset password for alice" })).toBeTruthy();
    expect(screen.getByText(/signs them out everywhere/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(screen.getByText("Use at least 12 characters.")).toBeTruthy();
    expect(mocks.resetUserPassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a brand new password" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.resetUserPassword).toHaveBeenCalledWith({ userId: "b", password: "a brand new password" });
  });

  it("closes on cancel and on Escape", () => {
    const onClose = vi.fn();
    render(<ResetPasswordDialog user={alice} open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
