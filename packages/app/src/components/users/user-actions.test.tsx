import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { UserActions } from "./user-actions";

vi.mock("./reset-password-dialog", () => ({
  ResetPasswordDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <button onClick={onClose}>close reset</button> : null,
}));
vi.mock("./set-active-dialog", () => ({
  SetActiveDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <button onClick={onClose}>close set-active</button> : null,
}));

beforeAll(() => {
  // Radix positions menus with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const alice = { id: "b", username: "alice", role: "user" as const, active: true, createdAt: new Date() };

function openMenu(username: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: `Actions for ${username}` }), { key: "Enter" });
}

describe("UserActions", () => {
  it("offers reset and deactivate for an active user, and never delete", () => {
    render(<UserActions user={alice} />);
    openMenu("alice");

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Reset password", "Deactivate"]);
    expect(screen.queryByText(/delete|remove/i)).toBeNull();
  });

  it("offers reactivate for an inactive user", () => {
    render(<UserActions user={{ ...alice, active: false }} />);
    openMenu("alice");

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Reset password", "Reactivate"]);
  });

  it("opens the matching dialog and closes it again", () => {
    render(<UserActions user={alice} />);

    openMenu("alice");
    fireEvent.click(screen.getByRole("menuitem", { name: "Reset password" }));
    fireEvent.click(screen.getByRole("button", { name: "close reset" }));
    expect(screen.queryByRole("button", { name: "close reset" })).toBeNull();

    openMenu("alice");
    fireEvent.click(screen.getByRole("menuitem", { name: "Deactivate" }));
    fireEvent.click(screen.getByRole("button", { name: "close set-active" }));
    expect(screen.queryByRole("button", { name: "close set-active" })).toBeNull();
  });

  it("opens the reactivate dialog for an inactive user", () => {
    render(<UserActions user={{ ...alice, active: false }} />);

    openMenu("alice");
    fireEvent.click(screen.getByRole("menuitem", { name: "Reactivate" }));

    expect(screen.getByRole("button", { name: "close set-active" })).toBeTruthy();
  });
});
