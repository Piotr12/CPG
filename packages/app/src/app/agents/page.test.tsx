import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import { agentDownloads } from "../../agent-downloads/downloads";
import { fixturePackage } from "../../agent-downloads/mcp-package-fixture";
import { HELP_TOPIC_ROUTES } from "../../help/topics";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import AgentsPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn(), headers: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const PROD = { host: "10.0.0.5:3000", "x-forwarded-host": "cpg.baby", "x-forwarded-proto": "https" };

let archive: string;
beforeAll(() => {
  const root = fixturePackage();
  vi.spyOn(process, "cwd").mockReturnValue(path.join(path.dirname(root), "packages", "app"));
  archive = agentDownloads().mcp.fileName;
});

interface Visit {
  os?: string | string[];
  userAgent?: string;
  locale?: "en" | "pl";
  requestHeaders?: Record<string, string>;
}

async function renderGuide({ os, userAgent = MAC_UA, locale = "en", requestHeaders = PROD }: Visit = {}) {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
  mocks.headers.mockResolvedValue(new Headers({ ...requestHeaders, "user-agent": userAgent }));
  return render(await resolveServerComponents(AgentsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(os === undefined ? {} : { os }) })));
}

const commands = () => [...document.querySelectorAll("[data-command]")].map((block) => block.textContent ?? "");
const shownOs = () => document.querySelector("[data-os]")?.getAttribute("data-os");

describe("AgentsPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("is the guide's own route and help topic, titled for the tab", () => {
    expect(HELP_TOPIC_ROUTES["ai-agents"]).toBe("/agents");
    expect(metadata.title).toBe("Use CPG from an AI agent · Caveman Planning Good");
  });

  it("names the six steps in order, at request time", async () => {
    await renderGuide();

    expect(screen.getByRole("heading", { level: 1, name: "Use CPG from an AI agent" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "1. What you get",
      "2. Install uv",
      "3. Create an API token",
      "4. Add the server to your agent",
      "5. Install the skill",
      "6. Check it works",
    ]);
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(mocks.headers.mock.invocationCallOrder[0]);
  });

  it("offers both downloads and links the token screen", async () => {
    await renderGuide();

    expect(screen.getByRole("link", { name: "Download the MCP server" }).getAttribute("href")).toBe(`/downloads/${archive}`);
    expect(screen.getByRole("link", { name: "Download the skill" }).getAttribute("href")).toBe("/downloads/cpg-onboarding-skill.zip");
    expect(screen.getByRole("link", { name: "API tokens" }).getAttribute("href")).toBe("/admin/tokens");
  });

  it("switches systems by link, marking the shown one as the current page", async () => {
    await renderGuide({ os: "linux" });

    const links = within(screen.getByRole("navigation", { name: "Commands for" })).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")])).toEqual([
      ["Windows", "/agents?os=windows", null],
      ["macOS", "/agents?os=macos", null],
      ["Linux", "/agents?os=linux", "page"],
    ]);
  });

  it("shows macOS's commands for ?os=macos: uv's installer or Homebrew, and shell skill installs", async () => {
    await renderGuide({ os: "macos", userAgent: WINDOWS_UA });

    expect(shownOs()).toBe("macos");
    expect(commands()).toContain("curl -LsSf https://astral.sh/uv/install.sh | sh");
    expect(commands()).toContain("brew install uv");
    expect(screen.getByText("~/.codex/config.toml")).toBeTruthy();
    expect(commands().filter((command) => command.startsWith("mkdir -p ~/"))).toHaveLength(2);
    expect(document.querySelector("[data-windows-shell]")).toBeNull();
  });

  it("shows Windows's PowerShell commands for a Windows browser without ?os=, and says to use PowerShell", async () => {
    await renderGuide({ userAgent: WINDOWS_UA });

    expect(shownOs()).toBe("windows");
    expect(document.querySelector("[data-windows-shell]")?.textContent).toBe("On Windows, run every command below in PowerShell.");
    expect(commands()).toContain('powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"');
    expect(commands()).toContain("winget install --id=astral-sh.uv -e");
    expect(screen.getByText("%USERPROFILE%\\.codex\\config.toml")).toBeTruthy();
    expect(commands().filter((command) => command.startsWith("New-Item -ItemType Directory"))).toHaveLength(2);
  });

  it("falls back to the browser's system for an unknown ?os=", async () => {
    await renderGuide({ os: "beos", userAgent: WINDOWS_UA });

    expect(shownOs()).toBe("windows");
  });

  it("adds the server for the default CPG without CPG_BASE_URL", async () => {
    await renderGuide({ os: "linux" });

    const claude = commands().find((command) => command.startsWith("claude mcp add"));
    expect(claude).toBe(`claude mcp add cpg -e CPG_API_TOKEN=<token> -- uvx --from https://cpg.baby/downloads/${archive} cpg-mcp`);
    expect(screen.getByText("https://cpg.baby").closest("p")?.textContent).toBe("These commands point at this CPG, https://cpg.baby.");
  });

  it("points every server command at the CPG that served the page when it isn't the default", async () => {
    await renderGuide({ os: "linux", requestHeaders: { host: "localhost:3000" } });

    const server = commands().filter((command) => command.includes("uvx") && command.includes("cpg-mcp"));
    expect(server).toHaveLength(3);
    expect(server.every((command) => command.includes("CPG_BASE_URL") && command.includes(`http://localhost:3000/downloads/${archive}`))).toBe(true);
    expect(commands().filter((command) => command.includes("http://localhost:3000/downloads/cpg-onboarding/SKILL.md"))).toHaveLength(2);
  });

  it("shows no secret: every token in a command is the literal <token>", async () => {
    await renderGuide();

    const tokens = commands().flatMap((command) => [...command.matchAll(/CPG_API_TOKEN[ =":]+([^\s",]+)/g)].map((match) => match[1]));
    expect(tokens.length).toBe(3);
    expect(new Set(tokens)).toEqual(new Set(["<token>"]));
  });

  it("tells Codex users how to allow unattended writes, and other agents to load the prompt", async () => {
    await renderGuide();

    expect(screen.getByText('default_tools_approval_mode = "approve"').closest("p")?.textContent).toContain("For unattended runs (codex exec)");
    expect(screen.getByText("cpg_onboarding").closest("p")?.textContent).toBe("Any other agent: ask it to load the prompt cpg_onboarding, which the MCP server offers.");
    expect(screen.getByText("cpg_whoami")).toBeTruthy();
  });

  it("speaks Polish to a Polish account, marked with lang=pl", async () => {
    await renderGuide({ locale: "pl" });

    expect(screen.getByRole("heading", { level: 1, name: "Korzystaj z CPG przez agenta AI" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("link", { name: "Pobierz serwer MCP" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Polecenia dla systemu" })).toBeTruthy();
  });

  it("shows the language-neutral loading shell until the request-time content streams", () => {
    const main = AgentsPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });
    const { fallback } = (main.props.children as { props: { fallback: ReactElement } }).props;

    expect(fallback.type).toBe(LoadingMessage);
  });
});
