import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { metadata } from "./layout";
import manifest from "./manifest";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

const publicDir = join(import.meta.dirname, "../../public");

describe("manifest", () => {
  it("names the app like the page title and opens it at the home page in the browser", () => {
    expect(manifest()).toMatchObject({
      name: metadata.title,
      short_name: "CPG",
      start_url: "/",
      display: "browser",
    });
  });

  it("lists the 192 and 512 px icons plus a maskable 512 px icon", () => {
    expect(manifest().icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });

  it("only points at icons that exist in public/", () => {
    for (const icon of manifest().icons ?? []) {
      expect(existsSync(join(publicDir, icon.src))).toBe(true);
    }
  });
});
