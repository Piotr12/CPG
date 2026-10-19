import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { SignedInBar } from "./signed-in-bar";

vi.mock("../../app/admin/actions", () => ({ signOut: vi.fn(), updatePreferences: vi.fn() }));

describe("SignedInBar", () => {
  it("names the signed-in user and offers the preferences and sign-out", () => {
    render(<SignedInBar username="admin" locale="en" theme="dark" messages={en} />);

    expect(screen.getByText("admin").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")?.dataset.action).toBe("sign-out");
    const theme = screen.getByRole("group", { name: "Theme" });
    expect(within(theme).getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("speaks the reader's language", () => {
    render(<SignedInBar username="admin" locale="pl" theme="light" messages={pl} />);

    expect(screen.getByText(/Zalogowano jako/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wyloguj" })).toBeTruthy();
  });
});
