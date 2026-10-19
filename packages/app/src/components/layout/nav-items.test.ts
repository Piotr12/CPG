import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { isCurrentPath, navItems, navLabel } from "./nav-items";

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
    expect(navLabel("signIn", pl.nav)).toBe("Zaloguj");
  });

  it("keeps the tenant names in every language", () => {
    expect(navLabel("test", pl.nav)).toBe("Test");
    expect(navLabel("prod", en.nav)).toBe("Prod");
  });
});

describe("isCurrentPath", () => {
  it("matches the entry's own screen", () => {
    expect(isCurrentPath("/admin/tokens", "/admin/tokens")).toBe(true);
    expect(isCurrentPath("/admin", "/admin")).toBe(true);
  });

  it("matches pages under an entry", () => {
    expect(isCurrentPath("/admin/test", "/admin/test/audit")).toBe(true);
  });

  it("doesn't let the tenant chooser match every /admin page", () => {
    expect(isCurrentPath("/admin", "/admin/tokens")).toBe(false);
  });

  it("doesn't match a path that only shares a prefix", () => {
    expect(isCurrentPath("/admin/test", "/admin/testing")).toBe(false);
    expect(isCurrentPath("/help", "/admin")).toBe(false);
  });
});
