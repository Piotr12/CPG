import { DOWNLOADS_PATH, SKILL_MARKDOWN_PATH } from "../../agent-downloads/downloads";
import { SKILL_FOLDER } from "../../agent-downloads/sources";

/** The systems the guide has commands for, in the order its switch lists them (spec A7). */
export const AGENT_OSES = ["windows", "macos", "linux"] as const;
export type AgentOs = (typeof AGENT_OSES)[number];

/** Product names, the same in every language, so they stay out of the dictionaries. */
export const OS_NAMES: Record<AgentOs, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };
export const AGENT_NAMES = { claude: "Claude Code", codex: "Codex" } as const;

/** The server's own default address (`CPG_BASE_URL` in `mcp/cpg_mcp/config.py`): commands for it omit the variable. */
export const DEFAULT_ORIGIN = "https://cpg.baby";

/** What the reader types in place of their token's secret. The guide never shows a real one. */
export const TOKEN_PLACEHOLDER = "<token>";

/** The prompt that carries the skill for agents without skill support, and the tool that proves the setup works. */
export const ONBOARDING_PROMPT = "cpg_onboarding";
export const CHECK_TOOL = "cpg_whoami";

/**
 * What lets non-interactive `codex exec` run the server's write tools, which it otherwise refuses since it
 * can't ask (`mcp_servers.<id>.default_tools_approval_mode`, developers.openai.com/codex/config-reference).
 */
export const CODEX_UNATTENDED_SETTING = 'default_tools_approval_mode = "approve"';

const isOs = (value: unknown): value is AgentOs => (AGENT_OSES as readonly unknown[]).includes(value);

/**
 * The system the guide shows (spec A7): `?os=` when it names one, otherwise the browser's: Windows when
 * the User-Agent says so, Linux when it says Linux but not Android, macOS otherwise.
 */
export function pickOs(requested: string | string[] | undefined, userAgent: string | null): AgentOs {
  if (isOs(requested)) return requested;
  const agent = userAgent ?? "";
  if (agent.includes("Windows")) return "windows";
  if (agent.includes("Linux") && !agent.includes("Android")) return "linux";
  return "macos";
}

/** A host name or address with an optional port: anything else is not put into a command. */
const HOST = /^[A-Za-z0-9.-]+(?::\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](?::\d{1,5})?$/;

/** The first value of a header a proxy may have appended to (`a, b`). */
const first = (value: string | null) => value?.split(",")[0].trim() || null;

/**
 * The origin of the request rendering the guide (spec A8): kamal-proxy's `X-Forwarded-Proto` and
 * `X-Forwarded-Host`, falling back to `Host` and `http`. A copied command then points at the CPG that
 * served it. A header that isn't a plain host or protocol gives the server's default instead.
 */
export function requestOrigin(headers: Headers): string {
  const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  const proto = first(headers.get("x-forwarded-proto")) ?? "http";
  if (!host || !HOST.test(host) || !["http", "https"].includes(proto)) return DEFAULT_ORIGIN;
  return `${proto}://${host}`;
}

/** Where each agent reads user skills: Claude Code's `~/.claude/skills`, Codex's `$HOME/.agents/skills` (developers.openai.com/codex/skills). */
const SKILL_HOMES = { claude: [".claude", "skills"], codex: [".agents", "skills"] } as const;
export type SkillAgent = keyof typeof SKILL_HOMES;

export interface InstallCommands {
  /** uv's own installer, and the package manager alternative where the system has one. */
  uv: { command: string; alternative?: { tool: string; command: string } };
  claudeMcp: string;
  codexConfigPath: string;
  codexConfig: string;
  mcpJson: string;
  /** A one-line skill install per agent, and the folder it writes to, as the system writes paths. */
  skill: Record<SkillAgent, { command: string; folder: string }>;
}

const UV_INSTALL_SH = "curl -LsSf https://astral.sh/uv/install.sh | sh";
const UV_INSTALL_PS = 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"';
const UV: Record<AgentOs, InstallCommands["uv"]> = {
  windows: { command: UV_INSTALL_PS, alternative: { tool: "winget", command: "winget install --id=astral-sh.uv -e" } },
  macos: { command: UV_INSTALL_SH, alternative: { tool: "Homebrew", command: "brew install uv" } },
  linux: { command: UV_INSTALL_SH },
};

/** Reads `<token>` and, away from the default CPG, `CPG_BASE_URL`, as the server's environment. */
function serverEnv(origin: string): Record<string, string> {
  return origin === DEFAULT_ORIGIN ? { CPG_API_TOKEN: TOKEN_PLACEHOLDER } : { CPG_API_TOKEN: TOKEN_PLACEHOLDER, CPG_BASE_URL: origin };
}

function skillInstall(os: AgentOs, origin: string, agent: SkillAgent): { command: string; folder: string } {
  const url = `${origin}${SKILL_MARKDOWN_PATH}`;
  const segments = [...SKILL_HOMES[agent], SKILL_FOLDER];
  if (os === "windows") {
    const folder = ["$HOME", ...segments].join("\\");
    return {
      command: `New-Item -ItemType Directory -Force "${folder}" | Out-Null; Invoke-WebRequest ${url} -OutFile "${folder}\\SKILL.md"`,
      folder: `${["$HOME", ...SKILL_HOMES[agent]].join("\\")}\\`,
    };
  }
  const folder = ["~", ...segments].join("/");
  return { command: `mkdir -p ${folder} && curl -fsSL ${url} -o ${folder}/SKILL.md`, folder: `${["~", ...SKILL_HOMES[agent]].join("/")}/` };
}

/**
 * Every command the guide shows for `os`, pointing at `origin` and at the package archive
 * `mcpFileName` (spec "The guide"). Commands, paths and URLs are built here, never translated.
 */
export function installCommands(os: AgentOs, origin: string, mcpFileName: string): InstallCommands {
  const mcpArchiveUrl = `${origin}${DOWNLOADS_PATH}/${mcpFileName}`;
  const env = serverEnv(origin);
  const args = ["--from", mcpArchiveUrl, "cpg-mcp"];
  const toml = (value: string) => JSON.stringify(value);

  return {
    uv: UV[os],
    claudeMcp: ["claude mcp add cpg", ...Object.entries(env).map(([name, value]) => `-e ${name}=${value}`), "-- uvx", ...args].join(" "),
    codexConfigPath: os === "windows" ? "%USERPROFILE%\\.codex\\config.toml" : "~/.codex/config.toml",
    codexConfig: [
      "[mcp_servers.cpg]",
      'command = "uvx"',
      `args = [${args.map(toml).join(", ")}]`,
      `env = { ${Object.entries(env)
        .map(([name, value]) => `${name} = ${toml(value)}`)
        .join(", ")} }`,
      // The first start downloads and builds the server, and an automatic MRP run can take a minute or two (mcp/README.md).
      "startup_timeout_sec = 60",
      "tool_timeout_sec = 300",
    ].join("\n"),
    mcpJson: JSON.stringify({ mcpServers: { cpg: { command: "uvx", args, env } } }, null, 2),
    skill: { claude: skillInstall(os, origin, "claude"), codex: skillInstall(os, origin, "codex") },
  };
}
