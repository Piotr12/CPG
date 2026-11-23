import path from "node:path";
import { archiveHash, ARCHIVE_HASH_LENGTH, buildArchive } from "./archive";
import { mcpPackageFiles, MCP_ARCHIVE_ROOT, SKILL_FOLDER, skillFiles } from "./sources";

/** Where the app serves the agent downloads (spec, API Contracts). */
export const DOWNLOADS_PATH = "/downloads";

/** The package archive's name pattern: any 12-hex hash, of which only the current one is served (A4). */
export const MCP_ARCHIVE_NAME = new RegExp(`^${MCP_ARCHIVE_ROOT}-[0-9a-f]{${ARCHIVE_HASH_LENGTH}}\\.zip$`);

/** The skill archive's name, fixed: the download button points at it (A5). */
export const SKILL_ARCHIVE_NAME = `${SKILL_FOLDER}-skill.zip`;

/** The raw skill file, which the guide's one-line install commands fetch (A5). */
export const SKILL_MARKDOWN_PATH = `${DOWNLOADS_PATH}/${SKILL_FOLDER}/SKILL.md`;

export interface AgentDownloads {
  /** The MCP server's source archive, named after its content's hash so a changed archive gets a new URL. */
  mcp: { fileName: string; bytes: Uint8Array };
  skill: { fileName: string; bytes: Uint8Array };
  skillMarkdown: Uint8Array;
}

/** Builds both archives from the `mcp/` folder at `root`. */
export function buildAgentDownloads(root: string): AgentDownloads {
  const mcp = buildArchive(mcpPackageFiles(root));
  const skill = skillFiles(root);
  return {
    mcp: { fileName: `${MCP_ARCHIVE_ROOT}-${archiveHash(mcp)}.zip`, bytes: mcp },
    skill: { fileName: SKILL_ARCHIVE_NAME, bytes: buildArchive(skill) },
    skillMarkdown: skill[0].bytes,
  };
}

/**
 * The repository's `mcp/` folder. `process.cwd()` is `packages/app` under `next dev` and under the
 * standalone `server.js`, which changes to its own directory; `next.config.ts` traces the files there.
 */
export const mcpRoot = () => path.join(/* turbopackIgnore: true */ process.cwd(), "..", "..", "mcp");

let built: AgentDownloads | undefined;

/**
 * The downloads, built once per process (spec A9): a deploy ships new files in a new process. A failed
 * build isn't kept, so the next request tries again.
 */
export function agentDownloads(): AgentDownloads {
  built ??= buildAgentDownloads(mcpRoot());
  return built;
}
