import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Every page.tsx under `dir`, relative to this folder. */
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name === "page.tsx" ? [path.relative(import.meta.dirname, full)] : [];
  });
}

/** The narrow pages (spec "Layout and the page frame"); every other admin page is wide. */
const NARROW = ["(global)/page.tsx", "(global)/tokens/page.tsx", "(global)/users/page.tsx", "[tenant]/page.tsx"];

/** The Tenants page is the navigation shell's (unit P4 of the design system run), which brings it into the frame. */
const NOT_YET = ["(global)/page.tsx"];

// Design system v1, "Layout and the page frame" and "States and copy → Loading": two widths, one padding
// rhythm, and a visible loading state from the first streamed frame on every admin page.
describe("admin page frame", () => {
  const all = pages(import.meta.dirname);
  const source = (page: string) => readFileSync(path.join(import.meta.dirname, page), "utf8");

  it("finds the pages", () => {
    expect(all).toEqual(expect.arrayContaining(NARROW));
    expect(all.length).toBeGreaterThan(NARROW.length);
  });

  it.each(all.filter((page) => !NOT_YET.includes(page)))("%s has the frame", (page) => {
    const main = /<main className="([^"]+)"/.exec(source(page))?.[1].split(" ");
    expect(main).toEqual(expect.arrayContaining(["mx-auto", "w-full", "px-4", "pt-6", "pb-8", "md:px-6", "md:pt-12", "md:pb-12"]));
    expect(main).toContain(NARROW.includes(page) ? "max-w-3xl" : "max-w-6xl");
    expect(main?.filter((name) => name.startsWith("gap-"))).toEqual([]);
    expect(source(page)).toContain("<Suspense fallback={<LoadingMessage />}>");
    expect(source(page)).not.toContain("aria-busy");
  });
});
