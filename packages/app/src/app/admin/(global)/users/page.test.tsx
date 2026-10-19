import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import UsersPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  list: vi.fn(),
  requireAdmin: vi.fn(),
  getMessages: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({
  requestScope: async () => ({ cradle: { userService: { list: mocks.list } } }),
}));
vi.mock("../../../../auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../../../components/users/create-user-dialog", () => ({
  CreateUserDialog: ({ labels }: { labels: { create: { open: string } } }) => <button>{labels.create.open}</button>,
}));
vi.mock("../../../../components/users/users-table", () => ({
  UsersTable: ({ users, labels }: { users: { username: string }[]; labels: { heading: string } }) => (
    <p>
      {labels.heading} table: {users.map((user) => user.username).join(", ")}
    </p>
  ),
}));

const users = [
  { id: "a", username: "admin", role: "admin", active: true, createdAt: new Date("2026-10-19T08:00:00Z") },
  { id: "b", username: "alice", role: "user", active: true, createdAt: new Date("2026-10-19T09:00:00Z") },
];

describe("UsersPage", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.list.mockResolvedValue(users);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists every account for the admin, says users are never deleted and offers Create user", async () => {
    render(await resolveServerComponents(UsersPage()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Users" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cave control" }).getAttribute("href")).toBe("/admin");
    expect(screen.getByText(/Users are never deleted\. Deactivate an account to end its access/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create user" })).toBeTruthy();
    expect(screen.getByText("Users table: admin, alice")).toBeTruthy();
  });

  it("speaks Polish to a Polish account", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(UsersPage()));

    const heading = screen.getByRole("heading", { name: "Użytkownicy" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("link", { name: "Kontrola jaskini" })).toBeTruthy();
    expect(screen.getByText(/Użytkownicy nigdy nie są usuwani/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Utwórz użytkownika" })).toBeTruthy();
  });

  it("renders no data when the gate refuses the visitor", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT /admin"));

    await expect(resolveServerComponents(UsersPage())).rejects.toThrow("NEXT_REDIRECT /admin");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("Users · Caveman Planning Good");
  });
});
