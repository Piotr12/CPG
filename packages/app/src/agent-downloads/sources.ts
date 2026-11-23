import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ArchiveFile } from "./archive";

/** The folder the package archive unpacks into: uv builds a source archive with one top folder. */
export const MCP_ARCHIVE_ROOT = "cpg-mcp";

/** The skill, as a folder holding `SKILL.md`, which unpacks into any agent's skills folder as it is. */
export const SKILL_FOLDER = "cpg-onboarding";

/** Where the skill lives inside the package (spec A1), relative to `mcp/`. */
export const SKILL_SOURCE = "cpg_mcp/skills/cpg-onboarding/SKILL.md";

/** The package files beside `cpg_mcp/` that hatchling needs to build it: the metadata and its readme. */
const PACKAGE_METADATA = ["pyproject.toml", "README.md"];

/**
 * Files that are never part of the package: Python's byte-code caches and dotfiles (`.DS_Store`, an editor's
 * swap file). A developer's `mcp/` has them, the image doesn't, and neither installs them.
 */
const isCache = (name: string) => name === "__pycache__" || name.endsWith(".pyc") || name.startsWith(".");

/** Every file under `dir`, as paths relative to `root` with `/` separators, caches skipped. */
function filesUnder(root: string, dir: string): string[] {
  return readdirSync(path.join(/* turbopackIgnore: true */ root, dir), { withFileTypes: true }).flatMap((entry) => {
    if (isCache(entry.name)) return [];
    const relative = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(root, relative) : [relative];
  });
}

const read = (root: string, relative: string) => new Uint8Array(readFileSync(path.join(/* turbopackIgnore: true */ root, relative)));

/**
 * The MCP server's source archive files (spec A4): `pyproject.toml`, `README.md` and `cpg_mcp/**` of
 * the `mcp/` folder at `root`, under `cpg-mcp/`. A missing file throws: an archive without it
 * wouldn't install.
 */
export function mcpPackageFiles(root: string): ArchiveFile[] {
  return [...PACKAGE_METADATA, ...filesUnder(root, "cpg_mcp")].map((relative) => ({
    path: `${MCP_ARCHIVE_ROOT}/${relative}`,
    bytes: read(root, relative),
  }));
}

/** The skill archive's one file, `cpg-onboarding/SKILL.md`, read from the package in `root` (spec A5). */
export function skillFiles(root: string): ArchiveFile[] {
  return [{ path: `${SKILL_FOLDER}/SKILL.md`, bytes: read(root, SKILL_SOURCE) }];
}
