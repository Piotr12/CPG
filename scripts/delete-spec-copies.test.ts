import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const COPY = "2026-11-02--1613UTC-root-ranking.md";
const ARCHIVED = "2026-11-01--0900UTC-abandoned.md";
const ACTIVE = "2026-11-02--1612UTC-still-active.md";

describe("scripts/delete-spec-copies.ts", () => {
  const argv = process.argv;
  let specs: string;

  beforeEach(() => {
    specs = mkdtempSync(join(tmpdir(), "delete-spec-copies-"));
    mkdirSync(join(specs, "implemented"));
    mkdirSync(join(specs, "archive"));
    for (const file of [COPY, ARCHIVED, ACTIVE, "README.md", `implemented/${COPY}`, `archive/${ARCHIVED}`]) {
      writeFileSync(join(specs, file), "# spec\n");
    }
  });

  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.resetModules();
    rmSync(specs, { recursive: true, force: true });
  });

  async function run(...args: string[]): Promise<string[]> {
    const printed: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => void printed.push(line));
    process.argv = ["node", "delete-spec-copies.ts", ...args];
    await import("./delete-spec-copies");
    return printed;
  }

  it("deletes the active copy of every implemented or archived spec and prints each path", async () => {
    expect(await run(specs)).toEqual([join(specs, ARCHIVED), join(specs, COPY)]);

    expect(readdirSync(specs).sort()).toEqual([ACTIVE, "README.md", "archive", "implemented"]);
    expect(existsSync(join(specs, "implemented", COPY))).toBe(true);
    expect(existsSync(join(specs, "archive", ARCHIVED))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("deletes and prints nothing when no spec is in two places", async () => {
    rmSync(join(specs, COPY));
    rmSync(join(specs, ARCHIVED));

    expect(await run(specs)).toEqual([]);
    expect(readdirSync(specs).sort()).toEqual([ACTIVE, "README.md", "archive", "implemented"]);
  });

  it("exits 1 with a usage line when no folder is given, deleting nothing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await run()).toEqual([]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith("Usage: node scripts/delete-spec-copies.ts <specsDir>");
    expect(existsSync(join(specs, COPY))).toBe(true);
  });

  // CI runs the file with plain `node` (spec-copies.yml, deploy.yml), with no build step: prove Node can strip
  // its types and resolve its import, so a PR fails before main does.
  it("runs under plain node, as the workflows run it", () => {
    const script = join(import.meta.dirname, "delete-spec-copies.ts");
    const output = execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", script, specs], {
      encoding: "utf8",
    });

    expect(output).toBe(`${join(specs, ARCHIVED)}\n${join(specs, COPY)}\n`);
    expect(existsSync(join(specs, COPY))).toBe(false);
  });
});
