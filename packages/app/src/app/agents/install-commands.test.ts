import { describe, expect, it } from "vitest";
import { installCommands, pickOs, requestOrigin } from "./install-commands";

const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const LINUX_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

const ARCHIVE = "cpg-mcp-0123456789ab.zip";

describe("pickOs", () => {
  it.each(["windows", "macos", "linux"] as const)("takes ?os=%s over the browser's system", (os) => {
    expect(pickOs(os, os === "windows" ? MAC_UA : WINDOWS_UA)).toBe(os);
  });

  it.each([
    [WINDOWS_UA, "windows"],
    [LINUX_UA, "linux"],
    [ANDROID_UA, "macos"],
    [MAC_UA, "macos"],
    [null, "macos"],
  ] as const)("without ?os=, reads the User-Agent %s as %s", (userAgent, os) => {
    expect(pickOs(undefined, userAgent)).toBe(os);
  });

  it.each([["solaris"], [["windows", "linux"]], [""]])("falls back to the User-Agent for ?os=%j", (requested) => {
    expect(pickOs(requested, LINUX_UA)).toBe("linux");
  });
});

describe("requestOrigin", () => {
  const origin = (entries: Record<string, string>) => requestOrigin(new Headers(entries));

  it("takes kamal-proxy's forwarded protocol and host, first value of a list", () => {
    expect(origin({ host: "10.0.0.5:3000", "x-forwarded-host": "cpg.baby", "x-forwarded-proto": "https" })).toBe("https://cpg.baby");
    expect(origin({ host: "app:3000", "x-forwarded-host": "cpg.baby, proxy.internal", "x-forwarded-proto": "https, http" })).toBe("https://cpg.baby");
  });

  it("falls back to Host and http, as npm run dev answers", () => {
    expect(origin({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(origin({ host: "[::1]:3000" })).toBe("http://[::1]:3000");
  });

  it.each([
    [{}],
    [{ host: "evil.example/`rm -rf ~`" }],
    [{ host: "cpg.baby", "x-forwarded-proto": "javascript" }],
    [{ "x-forwarded-host": " ", host: "" }],
  ])("gives the server's default for headers that aren't a plain host and protocol: %j", (entries) => {
    expect(origin(entries)).toBe("https://cpg.baby");
  });
});

describe("installCommands", () => {
  it("installs uv with its own installer, offering winget on Windows, Homebrew on macOS and nothing more on Linux", () => {
    expect(installCommands("windows", "https://cpg.baby", ARCHIVE).uv).toEqual({
      command: 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
      alternative: { tool: "winget", command: "winget install --id=astral-sh.uv -e" },
    });
    expect(installCommands("macos", "https://cpg.baby", ARCHIVE).uv).toEqual({
      command: "curl -LsSf https://astral.sh/uv/install.sh | sh",
      alternative: { tool: "Homebrew", command: "brew install uv" },
    });
    expect(installCommands("linux", "https://cpg.baby", ARCHIVE).uv).toEqual({ command: "curl -LsSf https://astral.sh/uv/install.sh | sh" });
  });

  it("adds the server for the default CPG without CPG_BASE_URL, from the hashed archive", () => {
    const commands = installCommands("macos", "https://cpg.baby", ARCHIVE);

    expect(commands.claudeMcp).toBe("claude mcp add cpg -e CPG_API_TOKEN=<token> -- uvx --from https://cpg.baby/downloads/cpg-mcp-0123456789ab.zip cpg-mcp");
    expect(commands.codexConfigPath).toBe("~/.codex/config.toml");
    expect(commands.codexConfig).toBe(
      [
        "[mcp_servers.cpg]",
        'command = "uvx"',
        'args = ["--from", "https://cpg.baby/downloads/cpg-mcp-0123456789ab.zip", "cpg-mcp"]',
        'env = { CPG_API_TOKEN = "<token>" }',
        "startup_timeout_sec = 60",
        "tool_timeout_sec = 300",
      ].join("\n"),
    );
    expect(JSON.parse(commands.mcpJson)).toEqual({
      mcpServers: { cpg: { command: "uvx", args: ["--from", "https://cpg.baby/downloads/cpg-mcp-0123456789ab.zip", "cpg-mcp"], env: { CPG_API_TOKEN: "<token>" } } },
    });
  });

  it("points every command at another CPG with CPG_BASE_URL, and names Codex's Windows config path", () => {
    const commands = installCommands("windows", "http://localhost:3000", ARCHIVE);

    expect(commands.claudeMcp).toBe(
      "claude mcp add cpg -e CPG_API_TOKEN=<token> -e CPG_BASE_URL=http://localhost:3000 -- uvx --from http://localhost:3000/downloads/cpg-mcp-0123456789ab.zip cpg-mcp",
    );
    expect(commands.codexConfigPath).toBe("%USERPROFILE%\\.codex\\config.toml");
    expect(commands.codexConfig).toContain('env = { CPG_API_TOKEN = "<token>", CPG_BASE_URL = "http://localhost:3000" }');
    expect(JSON.parse(commands.mcpJson).mcpServers.cpg.env).toEqual({ CPG_API_TOKEN: "<token>", CPG_BASE_URL: "http://localhost:3000" });
  });

  it("installs the skill into Claude Code's and Codex's user skills folders with one shell line on macOS and Linux", () => {
    for (const os of ["macos", "linux"] as const) {
      const { skill } = installCommands(os, "https://cpg.baby", ARCHIVE);

      expect(skill.claude).toEqual({
        command: "mkdir -p ~/.claude/skills/cpg-onboarding && curl -fsSL https://cpg.baby/downloads/cpg-onboarding/SKILL.md -o ~/.claude/skills/cpg-onboarding/SKILL.md",
        folder: "~/.claude/skills/",
      });
      expect(skill.codex).toEqual({
        command: "mkdir -p ~/.agents/skills/cpg-onboarding && curl -fsSL https://cpg.baby/downloads/cpg-onboarding/SKILL.md -o ~/.agents/skills/cpg-onboarding/SKILL.md",
        folder: "~/.agents/skills/",
      });
    }
  });

  it("installs the skill with one PowerShell line on Windows", () => {
    const { skill } = installCommands("windows", "https://cpg.baby", ARCHIVE);

    expect(skill.claude).toEqual({
      command:
        'New-Item -ItemType Directory -Force "$HOME\\.claude\\skills\\cpg-onboarding" | Out-Null; Invoke-WebRequest -UseBasicParsing https://cpg.baby/downloads/cpg-onboarding/SKILL.md -OutFile "$HOME\\.claude\\skills\\cpg-onboarding\\SKILL.md"',
      folder: "$HOME\\.claude\\skills\\",
    });
    expect(skill.codex.folder).toBe("$HOME\\.agents\\skills\\");
  });

  it.each(["windows", "macos", "linux"] as const)("never holds a secret on %s: the only token is the literal <token>", (os) => {
    const { claudeMcp, codexConfig, mcpJson } = installCommands(os, "https://cpg.baby", ARCHIVE);
    const tokens = [claudeMcp, codexConfig, mcpJson].flatMap((command) => [...command.matchAll(/CPG_API_TOKEN[ =":]+([^\s",]+)/g)].map((match) => match[1]));

    expect(tokens).toEqual(["<token>", "<token>", "<token>"]);
  });
});
