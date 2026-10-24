import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { listLinks } from "../lists/list-params";
import { usersLabels } from "./labels";
import { UsersTable } from "./users-table";

vi.mock("./user-actions", () => ({
  UserActions: ({ user }: { user: { username: string } }) => <button>Actions for {user.username}</button>,
}));

const users = [
  { id: "a", username: "admin", role: "admin" as const, active: true, createdAt: new Date("2026-10-19T08:00:00Z"), version: 1 },
  { id: "b", username: "alice", role: "user" as const, active: true, createdAt: new Date("2026-10-19T09:00:00Z"), version: 1 },
  { id: "c", username: "carol", role: "user" as const, active: false, createdAt: new Date("2026-10-18T09:00:00Z"), version: 1 },
];

const links = (search = "") => listLinks({ path: "/admin/users", search, sort: { sort: "role", dir: "asc" }, defaults: { sort: "role", dir: "asc" } });
const list = { search: "", sort: { sort: "role" as const, dir: "asc" as const }, links: links(), lists: en.lists };

describe("UsersTable", () => {
  it("shows username, role, status and creation date, with actions for normal users only", () => {
    render(<UsersTable labels={usersLabels(en)} users={users} {...list} />);

    const rows = within(screen.getByRole("table", { name: "Users" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["admin", "admin", "Active", "2026-10-19", ""],
      ["alice", "user", "Active", "2026-10-19", "Actions for alice"],
      ["carol", "user", "Inactive", "2026-10-18", "Actions for carol"],
    ]);
    const inactive = within(rows[2]).getByText("Inactive");
    expect(inactive.dataset.slot).toBe("status-badge");
    expect(inactive.dataset.tone).toBe("neutral");
    expect(inactive.className).toContain("border-dashed");
    const active = within(rows[1]).getByText("Active");
    expect(active.dataset.tone).toBe("neutral");
    expect(active.className).not.toContain("border-dashed");
    expect(within(rows[0]).getByText("admin", { selector: "[data-slot=badge]" })).toBeTruthy();
    expect(within(rows[2]).getByText("carol").classList).toContain("text-muted-foreground");
  });

  it("says so when there are no accounts", () => {
    render(<UsersTable labels={usersLabels(en)} users={[]} {...list} />);

    expect(screen.getByText("No accounts yet.")).toBeTruthy();
  });

  it("speaks Polish", () => {
    render(<UsersTable labels={usersLabels(pl)} users={users.slice(0, 2)} {...list} />);

    expect(screen.getByRole("table", { name: "Użytkownicy" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Nazwa użytkownika" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Akcje" })).toBeTruthy();
    expect(screen.getByText("administrator")).toBeTruthy();
    expect(screen.getAllByText("Aktywny")).toHaveLength(2);
  });

  it("sorts by every column through header links, marking the current sort (#217)", () => {
    render(<UsersTable labels={usersLabels(en)} users={users} {...list} sort={{ sort: "created", dir: "desc" }} />);

    expect(screen.getAllByRole("columnheader").map((header) => header.getAttribute("aria-sort"))).toEqual([
      "none",
      "none",
      "none",
      "descending",
      null,
    ]);
    expect(screen.getByRole("link", { name: "Username" }).getAttribute("href")).toBe("/admin/users?sort=username&dir=asc");
    expect(screen.getByRole("link", { name: "Created" }).getAttribute("href")).toBe("/admin/users?sort=created&dir=asc");
  });

  it("marks a search's words in the username, and says when nothing matches with the way back (#217)", () => {
    const { rerender } = render(<UsersTable labels={usersLabels(en)} users={users.slice(1, 2)} {...list} search="lic" links={links("lic")} />);
    expect([...document.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["lic"]);

    rerender(<UsersTable labels={usersLabels(en)} users={[]} {...list} search="dave" links={links("dave")} />);
    expect(screen.getByRole("cell").textContent).toBe("Nothing matches “dave”. Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/users");
  });
});
