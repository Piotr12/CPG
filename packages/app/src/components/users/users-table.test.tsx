import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { UsersTable } from "./users-table";

vi.mock("./user-actions", () => ({
  UserActions: ({ user }: { user: { username: string } }) => <button>Actions for {user.username}</button>,
}));

const users = [
  { id: "a", username: "admin", role: "admin" as const, active: true, createdAt: new Date("2026-10-19T08:00:00Z") },
  { id: "b", username: "alice", role: "user" as const, active: true, createdAt: new Date("2026-10-19T09:00:00Z") },
  { id: "c", username: "carol", role: "user" as const, active: false, createdAt: new Date("2026-10-18T09:00:00Z") },
];

describe("UsersTable", () => {
  it("shows username, role, status and creation date, with actions for normal users only", () => {
    render(<UsersTable labels={en.users} users={users} />);

    const rows = within(screen.getByRole("table", { name: "Users" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["admin", "admin", "Active", "2026-10-19", ""],
      ["alice", "user", "Active", "2026-10-19", "Actions for alice"],
      ["carol", "user", "Inactive", "2026-10-18", "Actions for carol"],
    ]);
    expect(within(rows[2]).getByText("Inactive").dataset.variant).toBe("destructive");
    expect(within(rows[2]).getByText("carol").classList).toContain("text-muted-foreground");
  });

  it("says so when there are no accounts", () => {
    render(<UsersTable labels={en.users} users={[]} />);

    expect(screen.getByText("No accounts yet.")).toBeTruthy();
  });

  it("speaks Polish", () => {
    render(<UsersTable labels={pl.users} users={users.slice(0, 2)} />);

    expect(screen.getByRole("table", { name: "Użytkownicy" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Nazwa użytkownika" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Akcje" })).toBeTruthy();
    expect(screen.getByText("administrator")).toBeTruthy();
    expect(screen.getAllByText("Aktywny")).toHaveLength(2);
  });
});
