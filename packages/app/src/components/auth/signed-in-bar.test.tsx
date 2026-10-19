import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { SignedInBar } from "./signed-in-bar";

vi.mock("../../app/admin/actions", () => ({ signOut: vi.fn(), updatePreferences: vi.fn() }));

describe("SignedInBar", () => {
  it("names the signed-in user and offers the preferences and sign-out", () => {
    render(<SignedInBar user={{ username: "admin", role: "admin" }} locale="en" theme="dark" messages={en} />);

    expect(screen.getByText("admin").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")?.dataset.action).toBe("sign-out");
    const theme = screen.getByRole("group", { name: "Theme" });
    expect(within(theme).getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("speaks the reader's language", () => {
    render(<SignedInBar user={{ username: "admin", role: "admin" }} locale="pl" theme="light" messages={pl} />);

    expect(screen.getByText(/Zalogowano jako/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wyloguj" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Użytkownicy" })).toBeTruthy();
  });

  it("links only the admin to the users screen", () => {
    const { rerender } = render(<SignedInBar user={{ username: "admin", role: "admin" }} locale="en" theme="light" messages={en} />);
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("href")).toBe("/admin/users");

    rerender(<SignedInBar user={{ username: "alice", role: "user" }} locale="en" theme="light" messages={en} />);
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.getByText("alice").tagName).toBe("STRONG");
  });
});
