import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { activeCopies, isValidName } from "./spec-copies";

describe("isValidName", () => {
  it("accepts YYYY-MM-DD--HHMMUTC-slug.md and rejects the old and malformed shapes", () => {
    expect(isValidName("2026-10-17--1432UTC-user-login.md")).toBe(true);
    expect(isValidName("2026-10-17--0005UTC-user-login-2.md")).toBe(true);
    expect(isValidName("2026-10-17-user-login.md")).toBe(false);
    expect(isValidName("2026-10-17--1432-user-login.md")).toBe(false);
    expect(isValidName("2026-10-17--1432UTC-User_Login.md")).toBe(false);
  });

  it("rejects a date or time that doesn't exist", () => {
    expect(isValidName("2026-02-30--1432UTC-user-login.md")).toBe(false);
    expect(isValidName("2026-13-01--1432UTC-user-login.md")).toBe(false);
    expect(isValidName("2026-10-17--2460UTC-user-login.md")).toBe(false);
    expect(isValidName("2026-10-17--2400UTC-user-login.md")).toBe(false);
  });
});

describe("activeCopies", () => {
  let specs: string;
  afterEach(() => rmSync(specs, { recursive: true, force: true }));

  function tree(files: string[]): string {
    specs = mkdtempSync(join(tmpdir(), "spec-copies-"));
    for (const file of files) {
      mkdirSync(join(specs, file, ".."), { recursive: true });
      writeFileSync(join(specs, file), "# spec\n");
    }
    return specs;
  }

  it("finds the active specs whose name is in implemented/ or archive/, sorted", () => {
    const dir = tree([
      "2026-11-02--1613UTC-root-ranking.md",
      "implemented/2026-11-02--1613UTC-root-ranking.md",
      "2026-11-01--0900UTC-abandoned.md",
      "archive/2026-11-01--0900UTC-abandoned.md",
      "2026-11-02--1612UTC-still-active.md",
      "implemented/2026-10-20--0757UTC-boms.md",
    ]);

    expect(activeCopies(dir)).toEqual(["2026-11-01--0900UTC-abandoned.md", "2026-11-02--1613UTC-root-ranking.md"]);
  });

  it("names a copy once when it is in both implemented/ and archive/", () => {
    const dir = tree([
      "2026-11-02--1613UTC-root-ranking.md",
      "implemented/2026-11-02--1613UTC-root-ranking.md",
      "archive/2026-11-02--1613UTC-root-ranking.md",
    ]);

    expect(activeCopies(dir)).toEqual(["2026-11-02--1613UTC-root-ranking.md"]);
  });

  it("ignores the fixed-name files and folders, even when implemented/ holds the same name", () => {
    const dir = tree([
      "README.md",
      "backlog.md",
      "product-brief.md",
      "implemented/README.md",
      "archive/README.md",
      "implemented/backlog.md",
      "assets/2026-11-02--1613UTC-root-ranking.md/shot.png",
      "implemented/2026-11-02--1613UTC-root-ranking.md",
    ]);

    expect(activeCopies(dir)).toEqual([]);
  });

  it("finds nothing when implemented/ or archive/ doesn't exist", () => {
    expect(activeCopies(tree(["2026-11-02--1613UTC-root-ranking.md", "implemented/2026-11-02--1613UTC-root-ranking.md"]))).toEqual([
      "2026-11-02--1613UTC-root-ranking.md",
    ]);
    rmSync(specs, { recursive: true, force: true });
    expect(activeCopies(tree(["2026-11-02--1613UTC-root-ranking.md"]))).toEqual([]);
  });
});
