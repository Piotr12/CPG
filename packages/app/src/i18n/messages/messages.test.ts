import { describe, expect, it } from "vitest";
import { en } from "./en";
import { pl } from "./pl";

/**
 * Every key path in a dictionary, with arrays indexed, so the two can be compared shape for shape.
 * Joined with `/`: some keys (audit action IDs) contain dots.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}/${key}` : key));
}

describe("dictionaries", () => {
  it("have the same keys in English and Polish", () => {
    expect(keyPaths(pl)).toEqual(keyPaths(en));
  });

  it("translate every string rather than copy it (aside from words Polish shares: the product name, Menu, Status, ID, and a number)", () => {
    const copied = keyPaths(en).filter((path) => {
      const read = (dictionary: object) => path.split("/").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary);
      return typeof read(en) === "string" && read(en) === read(pl);
    });

    expect(copied).toEqual([
      "home/title",
      "materials/columns/status",
      "materials/conversions/tiny",
      "locations/columns/id",
      "locations/columns/status",
      "customers/columns/id",
      "customers/columns/status",
      "suppliers/columns/id",
      "suppliers/columns/status",
      "audit/fields/id",
      "nav/menu",
    ]);
  });

  it.each([
    ["migrationsApplied", "3 migrations applied", "Zastosowane migracje: 3"],
    ["migrationsPending", "3 pending", "Oczekujące: 3"],
    ["settings", "3 settings", "Ustawienia: 3"],
  ] as const)("formats %s counts in both languages", (key, english, polish) => {
    expect(en.admin[key](3)).toBe(english);
    expect(pl.admin[key](3)).toBe(polish);
  });

  it("names a tenant's audit in both languages", () => {
    expect(en.audit.tenantHeading("Test")).toBe("Audit — Test");
    expect(pl.audit.tenantHeading("Test")).toBe("Audyt — Test");
  });

  it("formats help search results in both languages", () => {
    expect(en.help.matches(1, "x")).toBe("1 topic matches “x”.");
    expect(en.help.matches(2, "x")).toBe("2 topics match “x”.");
    expect(pl.help.matches(2, "x")).toBe("Pasujące tematy dla „x”: 2.");
    expect(en.help.noMatch("x")).toBe("No help topics match “x”.");
    expect(pl.help.noMatch("x")).toBe("Żaden temat nie pasuje do „x”.");
    expect(en.help.screen("/login")).toBe("Screen: /login");
    expect(pl.help.screen("/login")).toBe("Ekran: /login");
  });
});
