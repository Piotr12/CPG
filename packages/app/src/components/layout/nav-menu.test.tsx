import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavMenu } from "./nav-menu";

const mocks = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
// A plain anchor: jsdom has no router, and a click must not try to navigate.
vi.mock("next/link", () => ({
  default: ({ href, onClick, ...props }: ComponentProps<"a">) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      {...props}
    />
  ),
}));

const items = [
  { id: "tenants", href: "/admin", label: "Tenants" },
  { id: "test", href: "/admin/test", label: "Test" },
  { id: "tokens", href: "/admin/tokens", label: "API tokens" },
  { id: "help", href: "/help", label: "Help" },
];
const labels = { menu: "Menu", close: "Close", account: "Account" };
const account = {
  name: "alice",
  panel: <button type="button">Sign out</button>,
  inline: <p data-testid="inline-account">alice, inline</p>,
};

function renderMenu(props: Partial<ComponentProps<typeof NavMenu>> = {}) {
  return render(<NavMenu items={items} account={account} locale="en" labels={labels} {...props} />);
}

/** The inline entries, which are always in the DOM (CSS shows them from `md`). */
const inline = () => within(screen.getAllByRole("navigation", { name: "Menu" })[0]);
const current = (nav: ReturnType<typeof inline>) =>
  nav.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.textContent);

describe("NavMenu", () => {
  afterEach(() => {
    mocks.pathname = "/admin";
  });

  it("lists the entries inline, in order, and marks the open screen as current", () => {
    mocks.pathname = "/admin/tokens";
    renderMenu();

    expect(inline().getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Tenants", "/admin"],
      ["Test", "/admin/test"],
      ["API tokens", "/admin/tokens"],
      ["Help", "/help"],
    ]);
    expect(current(inline())).toEqual(["API tokens"]);
  });

  it("marks a tenant as current on the pages under it, and the tenant chooser only on itself", () => {
    mocks.pathname = "/admin/test/audit";
    renderMenu();

    expect(current(inline())).toEqual(["Test"]);
  });

  it("puts the account controls in the bar itself too (CSS shows them from xl)", () => {
    renderMenu();

    expect(screen.getByTestId("inline-account").textContent).toBe("alice, inline");
  });

  it("opens the account controls from a button that names the account", async () => {
    renderMenu();
    const button = screen.getByRole("button", { name: "Account: alice" });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    button.focus();
    fireEvent.click(button);

    const popover = screen.getByRole("dialog", { name: "Account" });
    expect(popover.getAttribute("lang")).toBe("en");
    expect(within(popover).getByRole("button", { name: "Sign out" })).toBeTruthy();

    fireEvent.keyDown(popover, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("opens the entries and the account controls in a sheet from the Menu button, and Escape closes it", async () => {
    mocks.pathname = "/help";
    renderMenu({ locale: "pl", labels: { menu: "Menu", close: "Zamknij", account: "Konto" } });
    const button = screen.getByRole("button", { name: "Menu" });

    button.focus();
    fireEvent.click(button);

    const sheet = screen.getByRole("dialog", { name: "Menu" });
    expect(sheet.getAttribute("lang")).toBe("pl");
    const entries = within(within(sheet).getByRole("navigation", { name: "Menu" }));
    expect(entries.getAllByRole("link").map((link) => link.textContent)).toEqual(["Tenants", "Test", "API tokens", "Help"]);
    expect(current(entries)).toEqual(["Help"]);
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Zamknij" })).toBeTruthy();

    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("closes the sheet when an entry is followed, the current one included", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("link", { name: "Tenants" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the account popover and the sheet when the page changes", () => {
    const { rerender } = renderMenu();
    const rerenderOn = (path: string) => {
      mocks.pathname = path;
      rerender(<NavMenu items={items} account={account} locale="en" labels={labels} />);
    };

    fireEvent.click(screen.getByRole("button", { name: "Account: alice" }));
    expect(screen.getByRole("dialog", { name: "Account" })).toBeTruthy();
    rerenderOn("/help");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeTruthy();
    rerenderOn("/admin/tokens");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the sheet from its close button", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers a visitor the entries only, without account controls", () => {
    renderMenu({ items: [items[3], { id: "signIn", href: "/login", label: "Sign in" }], account: null });

    expect(screen.queryByRole("button", { name: /Account/ })).toBeNull();
    expect(screen.queryByTestId("inline-account")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    expect(within(sheet).getAllByRole("link").map((link) => link.textContent)).toEqual(["Help", "Sign in"]);
    expect(within(sheet).queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
