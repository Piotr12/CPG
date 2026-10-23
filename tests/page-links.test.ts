import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appDir = path.resolve(import.meta.dirname, "../packages/app/src");
const PAGE_LINKS = "components/layout/page-links.tsx";

/** Every component and page under `dir`, recursively, without their tests. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [full] : [];
  });
}

// Engineering standards, reusable layers built once (#154): a paged list renders its Previous/Next
// links through PageLinks rather than its own markup, so every list reads and behaves the same. The
// check looks for a link labelled `….previous` or `….next`, the shape every list's own markup had.
describe("paged lists", () => {
  const files = sources(appDir).map((file) => path.relative(appDir, file));

  it("find the PageLinks source", () => {
    expect(files).toContain(PAGE_LINKS);
  });

  it.each(files.filter((file) => file !== PAGE_LINKS))("%s renders no Previous/Next page links of its own", (file) => {
    expect(readFileSync(path.join(appDir, file), "utf8")).not.toMatch(/\.(previous|next)\}\s*<\/Link>/);
  });
});
