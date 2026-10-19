import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { navItems, navLabel } from "./nav-items";

const ids = (user: Parameters<typeof navItems>[0]) => navItems(user).map((item) => item.id);

describe("navItems", () => {
  it("offers a visitor Help and Sign in", () => {
    expect(navItems(null)).toEqual([
      { id: "help", href: "/help" },
      { id: "signIn", href: "/login" },
    ]);
  });

  it("offers a normal user every screen it can open, without Users", () => {
    expect(navItems({ role: "user" })).toEqual([
      { id: "tenants", href: "/admin" },
      { id: "test", href: "/admin/test" },
      { id: "prod", href: "/admin/prod" },
      { id: "audit", href: "/admin/audit" },
      { id: "tokens", href: "/admin/tokens" },
      { id: "help", href: "/help" },
    ]);
  });

  it("adds Users for the admin, before Help", () => {
    expect(ids({ role: "admin" })).toEqual(["tenants", "test", "prod", "audit", "tokens", "users", "help"]);
    expect(navItems({ role: "admin" })).toContainEqual({ id: "users", href: "/admin/users" });
  });
});

describe("navLabel", () => {
  it("reads labels in the reader's language", () => {
    expect(navLabel("users", en.nav)).toBe("Users");
    expect(navLabel("users", pl.nav)).toBe("Użytkownicy");
    expect(navLabel("signIn", pl.nav)).toBe("Zaloguj się");
  });

  it("keeps the tenant names in every language", () => {
    expect(navLabel("test", pl.nav)).toBe("Test");
    expect(navLabel("prod", en.nav)).toBe("Prod");
  });
});
