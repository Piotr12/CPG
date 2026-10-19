import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_TOPIC_ROUTES } from "../packages/app/src/help/topics";

const appDir = path.resolve(import.meta.dirname, "../packages/app/src/app");

/** Every page.tsx under `dir`, recursively. */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

/**
 * A page's route: its directory under `src/app` with a leading slash, route groups `(x)` dropped and
 * dynamic segments kept as written (`/admin/materials/[id]`). Help topics name routes the same way.
 */
function pageRoute(file: string): string {
  const segments = path.relative(appDir, path.dirname(file)).split(path.sep).filter(Boolean);
  return `/${segments.filter((segment) => !/^\(.*\)$/.test(segment)).join("/")}`;
}

// D03: help grows screen by screen. A page without a help topic fails here (spec Phase 4).
describe("help coverage", () => {
  const routes = new Set(Object.values(HELP_TOPIC_ROUTES));

  it("maps page files to routes", () => {
    expect(pageRoute(path.join(appDir, "page.tsx"))).toBe("/");
    expect(pageRoute(path.join(appDir, "(public)", "login", "page.tsx"))).toBe("/login");
    expect(pageRoute(path.join(appDir, "admin", "materials", "[id]", "page.tsx"))).toBe("/admin/materials/[id]");
  });

  it.each(pages(appDir).map((file) => [pageRoute(file)]))("%s has a help topic", (route) => {
    expect(routes.has(route)).toBe(true);
  });
});
