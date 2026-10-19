import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateUserDialog } from "./create-user-dialog";

const mocks = vi.hoisted(() => ({ createUser: vi.fn() }));
vi.mock("../../app/admin/users/actions", () => ({ createUser: mocks.createUser }));

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("CreateUserDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("opens from its button, creates the user and closes", async () => {
    mocks.createUser.mockResolvedValue({ ok: true, data: { id: "b", username: "alice" } });
    render(<CreateUserDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    expect(screen.getByRole("dialog", { name: "Create user" })).toBeTruthy();
    fill("Username", "Alice");
    fill("Initial password", "initial password");
    fireEvent.click(screen.getAllByRole("button", { name: "Create user" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createUser).toHaveBeenCalledWith({ username: "Alice", password: "initial password" });
  });

  it("says when a name is taken and stays open", async () => {
    mocks.createUser.mockResolvedValue({ ok: false, error: { code: "CONFLICT", message: "That username is taken." } });
    render(<CreateUserDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    fill("Username", "alice");
    fill("Initial password", "initial password");
    fireEvent.click(screen.getAllByRole("button", { name: "Create user" }).at(-1)!);

    expect((await screen.findByRole("alert")).textContent).toBe("That username is taken.");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes on cancel without creating anything", () => {
    render(<CreateUserDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Create user" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});
