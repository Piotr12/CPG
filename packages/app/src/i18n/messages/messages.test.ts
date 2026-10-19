import { describe, expect, it } from "vitest";
import { en } from "./en";
import { pl } from "./pl";

/** Every key path in a dictionary, with arrays indexed, so the two can be compared shape for shape. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe("dictionaries", () => {
  it("have the same keys in English and Polish", () => {
    expect(keyPaths(pl)).toEqual(keyPaths(en));
  });

  it("translate every string rather than copy it (the product name aside)", () => {
    const copied = keyPaths(en).filter((path) => {
      const read = (dictionary: object) => path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary);
      return typeof read(en) === "string" && read(en) === read(pl);
    });

    expect(copied).toEqual(["home.title"]);
  });

  it.each([
    ["migrationsApplied", "3 migrations applied", "Zastosowane migracje: 3"],
    ["migrationsPending", "3 pending", "Oczekujące: 3"],
    ["settings", "3 settings", "Ustawienia: 3"],
  ] as const)("formats %s counts in both languages", (key, english, polish) => {
    expect(en.admin[key](3)).toBe(english);
    expect(pl.admin[key](3)).toBe(polish);
  });
});
