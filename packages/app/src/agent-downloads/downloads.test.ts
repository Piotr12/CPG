import { renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveHash } from "./archive";
import { FIXTURE_SKILL, fixturePackage } from "./mcp-package-fixture";

/** A fresh module, so the per-process memo starts empty. */
const load = async () => {
  vi.resetModules();
  return import("./downloads");
};

describe("buildAgentDownloads", () => {
  it("names the package archive after its content's hash and holds the package under cpg-mcp/", async () => {
    const { buildAgentDownloads } = await load();
    const { mcp } = buildAgentDownloads(fixturePackage());

    expect(mcp.fileName).toBe(`cpg-mcp-${archiveHash(mcp.bytes)}.zip`);
    expect(Object.keys(unzipSync(mcp.bytes))).toContain("cpg-mcp/cpg_mcp/skills/cpg-onboarding/SKILL.md");
  });

  it("gives the same name to the same files, and a new one when a file changes", async () => {
    const { buildAgentDownloads } = await load();
    const root = fixturePackage();
    const first = buildAgentDownloads(root).mcp.fileName;

    expect(buildAgentDownloads(fixturePackage()).mcp.fileName).toBe(first);
    writeFileSync(path.join(root, "cpg_mcp", "catalogue.json"), "{ }\n");
    expect(buildAgentDownloads(root).mcp.fileName).not.toBe(first);
  });

  it("zips the skill as its one folder, and serves the same text raw", async () => {
    const { buildAgentDownloads } = await load();
    const { skill, skillMarkdown } = buildAgentDownloads(fixturePackage());
    const entries = unzipSync(skill.bytes);

    expect(skill.fileName).toBe("cpg-onboarding-skill.zip");
    expect(Object.keys(entries)).toEqual(["cpg-onboarding/SKILL.md"]);
    expect(strFromU8(entries["cpg-onboarding/SKILL.md"])).toBe(FIXTURE_SKILL);
    expect(strFromU8(skillMarkdown)).toBe(FIXTURE_SKILL);
  });
});

describe("the download names", () => {
  it("match a package archive by any 12-hex hash, and nothing else", async () => {
    const { MCP_ARCHIVE_NAME, SKILL_MARKDOWN_PATH } = await load();

    expect(MCP_ARCHIVE_NAME.test("cpg-mcp-0123456789ab.zip")).toBe(true);
    for (const name of ["cpg-mcp-0123456789a.zip", "cpg-mcp-0123456789abc.zip", "cpg-mcp-0123456789AB.zip", "cpg-mcp-latest.zip", "x-cpg-mcp-0123456789ab.zip"]) {
      expect(MCP_ARCHIVE_NAME.test(name)).toBe(false);
    }
    expect(SKILL_MARKDOWN_PATH).toBe("/downloads/cpg-onboarding/SKILL.md");
  });
});

describe("agentDownloads", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads mcp/ two folders above the working directory, packages/app, once per process", async () => {
    const root = fixturePackage();
    vi.spyOn(process, "cwd").mockReturnValue(path.join(path.dirname(root), "packages", "app"));
    const { agentDownloads, mcpRoot } = await load();

    expect(mcpRoot()).toBe(root);
    const first = agentDownloads();
    writeFileSync(path.join(root, "cpg_mcp", "catalogue.json"), "{ }\n");
    expect(agentDownloads()).toBe(first);
  });

  it("keeps no failed build, so the next request tries again", async () => {
    const root = fixturePackage();
    vi.spyOn(process, "cwd").mockReturnValue(path.join(path.dirname(root), "packages", "app"));
    const { agentDownloads } = await load();
    renameSync(path.join(root, "pyproject.toml"), path.join(root, "moved.toml"));

    expect(() => agentDownloads()).toThrow(/pyproject\.toml/);
    renameSync(path.join(root, "moved.toml"), path.join(root, "pyproject.toml"));
    expect(agentDownloads().mcp.fileName).toMatch(/^cpg-mcp-[0-9a-f]{12}\.zip$/);
  });
});
