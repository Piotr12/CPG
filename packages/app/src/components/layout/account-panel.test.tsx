import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { AccountPanel } from "./account-panel";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), updatePreferences: vi.fn() }));
vi.mock("../../app/admin/actions", () => ({ signOut: mocks.signOut, updatePreferences: mocks.updatePreferences }));

describe("AccountPanel", () => {
  it("names the signed-in account and offers its switches, the current choices pressed, its API tokens and sign-out", () => {
    render(<AccountPanel username="alice" locale="en" theme="dark" messages={en} />);

    expect(screen.getByText("alice").tagName).toBe("STRONG");
    // Weights stop at semibold (design system v1).
    expect(screen.getByText("alice").className).toContain("font-semibold");
    expect(screen.getByText(/Signed in as/)).toBeTruthy();
    const language = screen.getByRole("group", { name: "Language" });
    expect(within(language).getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("true");
    const theme = screen.getByRole("group", { name: "Theme" });
    expect(within(theme).getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "API tokens" }).getAttribute("href")).toBe("/admin/tokens");
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")?.dataset.action).toBe("sign-out");
  });

  it("speaks Polish to a Polish account", () => {
    render(<AccountPanel username="alice" locale="pl" theme="light" messages={pl} />);

    expect(screen.getByText(/Zalogowano jako/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Język" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tokeny API" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wyloguj" })).toBeTruthy();
  });
});
