// Every image a spec embeds with a relative path must exist. Specs move from .ai/specs/ to
// implemented/ or archive/ when they are done, and a moved spec's `](assets/…)` links break
// silently unless they become `](../assets/…)`.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const specs = join(repoRoot, ".ai", "specs");

/** Markdown image targets that are files in the repository (not URLs or data URIs). */
const IMAGE = /!\[[^\]]*\]\(([^)\s]+)/g;

function relativeImages(markdown: string): string[] {
  return [...markdown.matchAll(IMAGE)].map(([, target]) => target).filter((target) => !/^[a-z]+:/i.test(target));
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

test("the image check finds relative image links only", () => {
  assert.deepEqual(
    relativeImages(
      "![a](assets/x/one.png) [b](assets/x/two.png) ![c](../assets/y.png \"title\") ![d](https://e.example/f.png) ![g](data:image/png;base64,AA)",
    ),
    ["assets/x/one.png", "../assets/y.png"],
  );
});

test("every image a spec embeds exists", () => {
  const missing = markdownFiles(specs).flatMap((file) =>
    relativeImages(readFileSync(file, "utf8"))
      .filter((target) => !existsSync(join(dirname(file), decodeURI(target))))
      .map((target) => `${relative(repoRoot, file)}: ${target}`),
  );

  assert.deepEqual(
    missing,
    [],
    `Fix these image links (a spec moved to implemented/ or archive/ needs ../assets/…):\n${missing.join("\n")}`,
  );
});
