import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { AccountPanel } from "./account-panel";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), updatePreferences: vi.fn() }));
vi.mock("../../app/admin/actions", () => ({ signOut: mocks.signOut, updatePreferences: mocks.updatePreferences }));

describe("AccountPanel", () => {
  it("names the signed-in account and offers its switches, the current choices pressed, and sign-out", () => {
    render(<AccountPanel username="alice" locale="en" theme="dark" messages={en} />);

    expect(screen.getByText("alice").tagName).toBe("STRONG");
    expect(screen.getByText(/Signed in as/)).toBeTruthy();
    const language = screen.getByRole("group", { name: "Language" });
    expect(within(language).getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("true");
    const theme = screen.getByRole("group", { name: "Theme" });
    expect(within(theme).getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")?.dataset.action).toBe("sign-out");
  });

  it("lays the same controls out in one row for the bar, the name truncated and Signed in as left to screen readers", () => {
    const { container } = render(<AccountPanel username="alice" locale="en" theme="light" messages={en} layout="inline" />);

    expect(container.querySelector("[data-account-panel]")?.getAttribute("data-account-panel")).toBe("inline");
    expect(screen.getByText(/Signed in as/).classList).toContain("sr-only");
    const name = screen.getByText("alice");
    expect(name.classList).toContain("truncate");
    expect(name.getAttribute("title")).toBe("alice");
    expect(screen.getByRole("group", { name: "Language" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")?.dataset.action).toBe("sign-out");
  });

  it("stacks them by default, for the popover and the sheet", () => {
    const { container } = render(<AccountPanel username="alice" locale="en" theme="light" messages={en} />);

    expect(container.querySelector("[data-account-panel]")?.getAttribute("data-account-panel")).toBe("stacked");
    expect(screen.getByText(/Signed in as/).classList).not.toContain("sr-only");
  });

  it("speaks Polish to a Polish account", () => {
    render(<AccountPanel username="alice" locale="pl" theme="light" messages={pl} />);

    expect(screen.getByText(/Zalogowano jako/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Język" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wyloguj" })).toBeTruthy();
  });
});
