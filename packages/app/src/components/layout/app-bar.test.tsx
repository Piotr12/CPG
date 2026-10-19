import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { AppBar, AppBarPlaceholder } from "./app-bar";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  currentUser: vi.fn(),
  currentPreferences: vi.fn(),
  getMessages: vi.fn(),
  documentPreferences: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/help" }));
vi.mock("../../app/admin/actions", () => ({ signOut: vi.fn(), updatePreferences: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("../../preferences/current-preferences", () => ({ currentPreferences: mocks.currentPreferences }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../preferences/document-preferences", () => ({
  DocumentPreferences: (props: object) => {
    mocks.documentPreferences(props);
    return null;
  },
}));

function as(user: object | null, locale: "en" | "pl", theme: "light" | "dark") {
  mocks.currentUser.mockResolvedValue(user);
  mocks.currentPreferences.mockResolvedValue({ locale, theme });
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
}

describe("AppBar", () => {
  afterEach(() => vi.clearAllMocks());

  it("offers a signed-in account its screens and controls, in its language, and applies its preferences", async () => {
    as({ userId: "u1", username: "alice", role: "user" }, "pl", "dark");

    render(await AppBar());

    const bar = screen.getByRole("banner");
    expect(bar.getAttribute("lang")).toBe("pl");
    expect(within(bar).getByRole("link", { name: "CPG" }).getAttribute("href")).toBe("/");
    const menu = within(screen.getByRole("navigation", { name: "Menu" }));
    expect(menu.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Środowiska", "/admin"],
      ["Test", "/admin/test"],
      ["Prod", "/admin/prod"],
      ["Audyt", "/admin/audit"],
      ["Tokeny API", "/admin/tokens"],
      ["Pomoc", "/help"],
    ]);
    expect(menu.getByRole("link", { name: "Pomoc" }).getAttribute("aria-current")).toBe("page");
    expect(mocks.documentPreferences).toHaveBeenCalledWith({ locale: "pl", theme: "dark", isSignedIn: true });
    expect(mocks.connection).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Konto: alice" }));
    const account = screen.getByRole("dialog", { name: "Konto" });
    expect(within(account).getByText("alice").tagName).toBe("STRONG");
    expect(within(account).getByRole("button", { name: "Ciemny" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(account).getByRole("button", { name: "Wyloguj" })).toBeTruthy();
  });

  it("adds Users to the admin's menu", async () => {
    as({ userId: "u0", username: "admin", role: "admin" }, "en", "light");

    render(await AppBar());

    expect(screen.getByRole("link", { name: "Users" }).getAttribute("href")).toBe("/admin/users");
  });

  it("offers a visitor Help and Sign in, and tells the document it is signed out", async () => {
    as(null, "en", "light");

    render(await AppBar());

    const menu = within(screen.getByRole("navigation", { name: "Menu" }));
    expect(menu.getAllByRole("link").map((link) => link.textContent)).toEqual(["Help", "Sign in"]);
    expect(screen.queryByRole("button", { name: /Account/ })).toBeNull();
    expect(mocks.documentPreferences).toHaveBeenCalledWith({ locale: "en", theme: "light", isSignedIn: false });
  });

  it("holds its height, without text, while streaming", () => {
    const { container } = render(<AppBarPlaceholder />);

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    // The bar's own height and border, so nothing moves when it arrives.
    expect(container.firstElementChild?.classList).toContain("h-12");
    expect(container.textContent).toBe("");
  });
});
