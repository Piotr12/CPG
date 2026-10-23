import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const password = inject("adminPassword");
const appDir = path.resolve(import.meta.dirname, "../../packages/app");

type IconLink = { rel: string; href: string; sizes: string | null; type: string | null };

const PAGES = ["/", "/admin"];

/** Fetches a URL (absolute, or relative to the app) and asserts it answers 200 with this type. */
async function fetchAs(url: string, contentType: string) {
  const response = await fetch(new URL(url, baseUrl));
  expect(response.status, url).toBe(200);
  expect(response.headers.get("content-type"), url).toContain(contentType);
  return Buffer.from(await response.arrayBuffer());
}

describe("the mammoth app icons", () => {
  let browser: Browser;
  // The icon <link>s of each page, keyed by path. The home page is static; /admin is partially
  // prerendered, so both rendering modes are covered. /admin is read signed in: signed out, it
  // streams a redirect to /login, and a read could land on that new document before its head (#166).
  const links: Record<string, IconLink[]> = {};

  beforeAll(async () => {
    browser = openBrowser();
    for (const page of PAGES) {
      if (page === "/admin") await signInAsAdmin(browser, baseUrl, password);
      await browser.open(`${baseUrl}${page}`);
      // `open` can return before the head is complete: read the links only once this page's
      // document has loaded and holds the manifest.
      await browser.waitUntil(
        `location.pathname === ${JSON.stringify(page)} && document.readyState === "complete" && document.querySelector('link[rel="manifest"]')`,
      );
      links[page] = await browser.evaluate<IconLink[]>(
        `[...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')]
          .map((l) => ({ rel: l.rel, href: l.getAttribute("href"), sizes: l.getAttribute("sizes"), type: l.getAttribute("type") }))`,
      );
    }
  });
  afterAll(() => browser.close());

  it.each(PAGES)("links the favicon, SVG icon, Apple touch icon and manifest from %s", (page) => {
    // Pinned to what Next.js emits, so a framework change in how browsers pick an icon fails here.
    expect(links[page]).toEqual([
      { rel: "manifest", href: "/manifest.webmanifest", sizes: null, type: null },
      { rel: "icon", href: expect.stringMatching(/^\/favicon\.ico\?/), sizes: "48x48", type: "image/x-icon" },
      { rel: "icon", href: expect.stringMatching(/^\/icon\.svg\?/), sizes: "any", type: "image/svg+xml" },
      {
        rel: "apple-touch-icon",
        href: expect.stringMatching(/^\/apple-icon\.png\?/),
        sizes: "180x180",
        type: "image/png",
      },
    ]);
  });

  it("serves the committed icon files at the linked URLs", async () => {
    const committed = {
      "image/x-icon": "src/app/favicon.ico",
      "image/svg+xml": "src/app/icon.svg",
      "image/png": "src/app/apple-icon.png",
    } as const;

    for (const link of links["/"].filter((l) => l.rel !== "manifest")) {
      const type = link.type as keyof typeof committed;
      const body = await fetchAs(link.href, type);
      expect(body.equals(readFileSync(path.join(appDir, committed[type]))), link.href).toBe(true);
    }
  });

  it("serves the bare /favicon.ico that browsers probe without a link", async () => {
    const body = await fetchAs("/favicon.ico", "image/x-icon");
    expect(body.equals(readFileSync(path.join(appDir, "src/app/favicon.ico")))).toBe(true);
  });

  it("serves a manifest whose icons all resolve to the committed PNGs", async () => {
    const manifest = JSON.parse((await fetchAs("/manifest.webmanifest", "application/manifest+json")).toString());

    expect(manifest.name).toBe("Caveman Planning Good");
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    for (const icon of manifest.icons as { src: string }[]) {
      const body = await fetchAs(icon.src, "image/png");
      expect(body.equals(readFileSync(path.join(appDir, "public", icon.src))), icon.src).toBe(true);
    }
  });
});
