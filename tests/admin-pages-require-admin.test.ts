import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const adminDir = path.resolve(import.meta.dirname, "../packages/app/src/app/admin");

/**
 * Pages only the admin may open, relative to `app/admin`. Every other `/admin` page is open to any
 * signed-in account, so a page belongs here as soon as it shows or changes admin-only data.
 */
const ADMIN_ONLY_PAGES = ["(global)/users/page.tsx", "[tenant]/import/page.tsx"];

/** Every page.tsx under `dir`, recursively. */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

// Engineering standards, Security: every /admin page gates its data behind requireUser() or,
// when admin-only, requireAdmin().
describe("admin pages", () => {
  const adminPages = pages(adminDir).map((file) => path.relative(adminDir, file));
  const source = (page: string) => readFileSync(path.join(adminDir, page), "utf8");

  it("exist", () => {
    expect(adminPages.length).toBeGreaterThan(0);
  });

  it.each(adminPages)("%s calls requireUser() or requireAdmin()", (page) => {
    expect(source(page)).toMatch(/\bawait require(User|Admin)\(\)/);
  });

  it.each(ADMIN_ONLY_PAGES)("admin-only %s exists and calls requireAdmin()", (page) => {
    expect(adminPages).toContain(page);
    expect(source(page)).toMatch(/\bawait requireAdmin\(\)/);
  });
});
