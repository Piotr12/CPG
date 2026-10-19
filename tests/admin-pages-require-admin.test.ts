import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const adminDir = path.resolve(import.meta.dirname, "../packages/app/src/app/admin");

/** Every page.tsx under `dir`, recursively. */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "page.tsx" ? [full] : [];
  });
}

// Engineering standards, Security: every /admin page gates its data behind requireAdmin().
describe("admin pages", () => {
  const adminPages = pages(adminDir);

  it("exist", () => {
    expect(adminPages.length).toBeGreaterThan(0);
  });

  it.each(adminPages.map((file) => [path.relative(adminDir, file), file]))("%s calls requireAdmin()", (_name, file) => {
    expect(readFileSync(file, "utf8")).toMatch(/\bawait requireAdmin\(\)/);
  });
});
