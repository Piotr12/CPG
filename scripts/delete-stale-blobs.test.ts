import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("scripts/delete-stale-blobs.ts", () => {
  const argv = process.argv;
  let blobs: string;

  function write(...files: string[]) {
    for (const file of files) writeFileSync(join(blobs, file), "{}\n");
  }

  beforeEach(() => {
    blobs = mkdtempSync(join(tmpdir(), "delete-stale-blobs-"));
  });

  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.resetModules();
    rmSync(blobs, { recursive: true, force: true });
  });

  async function run(...args: string[]): Promise<string[]> {
    const printed: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => void printed.push(line));
    process.argv = ["node", "delete-stale-blobs.ts", ...args];
    await import("./delete-stale-blobs");
    return printed;
  }

  // #399: attempt 1's unit-timing failed, attempt 2 re-ran only it, and unit-coverage merged both timing blobs.
  it("keeps each shard's newest attempt and deletes and prints the blobs it replaces", async () => {
    write("blob-1-1.json", "blob-2-1.json", "blob-timing-1.json", "blob-timing-2.json", "blob-2-3.json");

    expect(await run(blobs)).toEqual([join(blobs, "blob-2-1.json"), join(blobs, "blob-timing-1.json")]);

    expect(readdirSync(blobs).sort()).toEqual(["blob-1-1.json", "blob-2-3.json", "blob-timing-2.json"]);
    expect(process.exitCode).toBeUndefined();
  });

  it("compares attempts as numbers, not as text", async () => {
    write("blob-1-9.json", "blob-1-10.json");

    expect(await run(blobs)).toEqual([join(blobs, "blob-1-9.json")]);
    expect(readdirSync(blobs)).toEqual(["blob-1-10.json"]);
  });

  it("deletes nothing when every shard ran once, and leaves files outside the pattern alone", async () => {
    write("blob-1-1.json", "blob-2-1.json", "blob-timing-1.json", "blob-1.json", "notes.txt");

    expect(await run(blobs)).toEqual([]);
    expect(readdirSync(blobs)).toHaveLength(5);
  });

  it("exits 1 with a usage line when no folder is given, deleting nothing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await run()).toEqual([]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledWith("Usage: node scripts/delete-stale-blobs.ts <blobsDir>");
  });

  // unit-coverage runs the file with plain `node`, with no build step: prove Node can strip its types, so a PR
  // fails before main does.
  it("runs under plain node, as unit-coverage runs it", () => {
    write("blob-timing-1.json", "blob-timing-2.json");
    const script = join(import.meta.dirname, "delete-stale-blobs.ts");
    const output = execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", script, blobs], {
      encoding: "utf8",
    });

    expect(output).toBe(`${join(blobs, "blob-timing-1.json")}\n`);
    expect(readdirSync(blobs)).toEqual(["blob-timing-2.json"]);
  });
});
