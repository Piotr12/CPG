import { rmSync } from "node:fs";
import path from "node:path";
import { strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { FIXTURE_SKILL, fixturePackage } from "./mcp-package-fixture";
import { mcpPackageFiles, skillFiles } from "./sources";

describe("mcpPackageFiles", () => {
  it("lists pyproject.toml, README.md and cpg_mcp/** under cpg-mcp/, skipping byte-code caches, tests and the lock file", () => {
    const files = mcpPackageFiles(fixturePackage());

    expect(files.map(({ path }) => path).sort()).toEqual([
      "cpg-mcp/README.md",
      "cpg-mcp/cpg_mcp/__init__.py",
      "cpg-mcp/cpg_mcp/catalogue.json",
      "cpg-mcp/cpg_mcp/skills/cpg-onboarding/SKILL.md",
      "cpg-mcp/cpg_mcp/tools/__init__.py",
      "cpg-mcp/pyproject.toml",
    ]);
    expect(strFromU8(files.find(({ path }) => path === "cpg-mcp/pyproject.toml")!.bytes)).toBe('[project]\nname = "cpg-mcp"\n');
  });

  it("throws when a file the package needs is missing", () => {
    const root = fixturePackage();
    rmSync(path.join(root, "README.md"));

    expect(() => mcpPackageFiles(root)).toThrow(/README\.md/);
  });
});

describe("skillFiles", () => {
  it("is the one file cpg-onboarding/SKILL.md, read from the package", () => {
    const files = skillFiles(fixturePackage());

    expect(files.map(({ path }) => path)).toEqual(["cpg-onboarding/SKILL.md"]);
    expect(strFromU8(files[0].bytes)).toBe(FIXTURE_SKILL);
  });
});
