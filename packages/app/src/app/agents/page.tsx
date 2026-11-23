import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { cn } from "@cpg/ui/lib/utils";
import { agentDownloads } from "../../agent-downloads/downloads";
import { SKILL_FOLDER } from "../../agent-downloads/sources";
import { DownloadButtons } from "../../components/agent-downloads/download-buttons";
import { fillNodes } from "../../i18n/fill-nodes";
import { getMessages } from "../../i18n/get-messages";
import type { Messages } from "../../i18n/messages/en";
import {
  AGENT_NAMES,
  AGENT_OSES,
  CHECK_TOOL,
  CODEX_UNATTENDED_SETTING,
  installCommands,
  ONBOARDING_PROMPT,
  OS_NAMES,
  pickOs,
  requestOrigin,
  TOKEN_PLACEHOLDER,
  type AgentOs,
  type InstallCommands,
} from "./install-commands";

export const metadata: Metadata = { title: "Use CPG from an AI agent · Caveman Planning Good" };

/** The screen that creates the token the commands need (help topic `api-tokens`). */
const TOKENS_PATH = "/admin/tokens";

type Labels = Messages["agents"];

/**
 * Public install guide for the MCP server and the onboarding skill (#398, spec "The guide"), for
 * Windows, macOS or Linux. Rendered on the server: `?os=` picks the system, without script.
 */
export default function AgentsPage({ searchParams }: PageProps<"/agents">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-8 md:px-6 md:pt-12 md:pb-12">
      <Suspense fallback={<LoadingMessage />}>
        <InstallGuide searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function InstallGuide({ searchParams }: Pick<PageProps<"/agents">, "searchParams">) {
  await connection();
  const [{ locale, messages }, requestHeaders, { os: requested }] = await Promise.all([getMessages(), headers(), searchParams]);
  const t = messages.agents;
  const os = pickOs(requested, requestHeaders.get("user-agent"));
  const origin = requestOrigin(requestHeaders);
  const { mcp } = agentDownloads();
  const commands = installCommands(os, origin, mcp.fileName);

  return (
    <div lang={locale} data-os={os} className="flex flex-col gap-8">
      <div className="flex max-w-prose flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p>{fillNodes(t.intro, { claude: AGENT_NAMES.claude, codex: AGENT_NAMES.codex })}</p>
      </div>
      <OsSwitch selected={os} label={t.osLabel} />
      {os === "windows" && <p data-windows-shell>{fillNodes(t.windowsShell, { shell: <Code>PowerShell</Code> })}</p>}

      <Step n={1} id="agents-get" heading={t.getHeading}>
        <p>{fillNodes(t.mcp, { uvx: <Code>uvx</Code> })}</p>
        <p>{t.skill}</p>
        <DownloadButtons mcpFileName={mcp.fileName} labels={t} />
      </Step>
      <Step n={2} id="agents-uv" heading={t.uvHeading}>
        <UvStep t={t} uv={commands.uv} />
      </Step>
      <Step n={3} id="agents-token" heading={t.tokenHeading}>
        <p>
          {fillNodes(t.tokenText, {
            tokens: (
              <Link href={TOKENS_PATH} className="underline underline-offset-4">
                {t.tokensLink}
              </Link>
            ),
            placeholder: <Code>{TOKEN_PLACEHOLDER}</Code>,
          })}
        </p>
      </Step>
      <Step n={4} id="agents-server" heading={t.serverHeading}>
        <ServerStep t={t} commands={commands} origin={origin} />
      </Step>
      <Step n={5} id="agents-skill" heading={t.skillHeading}>
        <SkillStep t={t} commands={commands} />
      </Step>
      <Step n={6} id="agents-check" heading={t.checkHeading}>
        <p>{fillNodes(t.checkText, { tool: <Code>{CHECK_TOOL}</Code> })}</p>
        <p>{t.checkFails}</p>
      </Step>
    </div>
  );
}

/** One link per system; the shown one is the current page (spec A7). */
function OsSwitch({ selected, label }: { selected: AgentOs; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <ul className="flex flex-wrap gap-2">
        {AGENT_OSES.map((os) => (
          <li key={os}>
            <Link
              href={`/agents?os=${os}`}
              aria-current={os === selected ? "page" : undefined}
              className={cn(
                "inline-flex rounded-md border px-3 py-1 text-sm",
                os === selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
              )}
            >
              {OS_NAMES[os]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Step({ n, id, heading, children }: { n: number; id: string; heading: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-border pt-4">
      <h2 id={id} className="text-lg font-semibold">
        {n}. {heading}
      </h2>
      {children}
    </section>
  );
}

function UvStep({ t, uv }: { t: Labels; uv: InstallCommands["uv"] }) {
  return (
    <>
      <p>{fillNodes(t.uvText, { uv: <Code>uv</Code> })}</p>
      <Command>{uv.command}</Command>
      {uv.alternative && (
        <>
          <p>{fillNodes(t.uvAlternative, { tool: uv.alternative.tool })}</p>
          <Command>{uv.alternative.command}</Command>
        </>
      )}
      <p>{fillNodes(t.uvNewTerminal, { uvx: <Code>uvx</Code> })}</p>
    </>
  );
}

function ServerStep({ t, commands, origin }: { t: Labels; commands: InstallCommands; origin: string }) {
  return (
    <>
      <p>{fillNodes(t.forAgentRun, { agent: AGENT_NAMES.claude })}</p>
      <Command>{commands.claudeMcp}</Command>
      <p>{fillNodes(t.forCodex, { agent: AGENT_NAMES.codex, path: <Code>{commands.codexConfigPath}</Code> })}</p>
      <Command>{commands.codexConfig}</Command>
      <p className="text-sm text-muted-foreground">
        {fillNodes(t.codexUnattended, {
          command: <Code>codex exec</Code>,
          setting: <Code>{CODEX_UNATTENDED_SETTING}</Code>,
          table: <Code>[mcp_servers.cpg]</Code>,
        })}
      </p>
      <p>{fillNodes(t.forOther, { key: <Code>mcpServers</Code> })}</p>
      <Command>{commands.mcpJson}</Command>
      <p className="text-sm text-muted-foreground">{fillNodes(t.serverAddress, { origin: <Code>{origin}</Code> })}</p>
    </>
  );
}

function SkillStep({ t, commands }: { t: Labels; commands: InstallCommands }) {
  return (
    <>
      {(["claude", "codex"] as const).map((agent) => (
        <div key={agent} className="flex flex-col gap-3">
          <p>{fillNodes(t.forAgentRun, { agent: AGENT_NAMES[agent] })}</p>
          <Command>{commands.skill[agent].command}</Command>
          <p>{fillNodes(t.skillUnzip, { folder: <Code>{commands.skill[agent].folder}</Code>, skillFolder: <Code>{SKILL_FOLDER}</Code> })}</p>
        </div>
      ))}
      <p>{fillNodes(t.skillOther, { prompt: <Code>{ONBOARDING_PROMPT}</Code> })}</p>
    </>
  );
}

function Code({ children }: { children: string }) {
  return <code className="rounded-sm bg-muted px-1 font-mono text-sm">{children}</code>;
}

/** A command to copy: wrapped rather than scrolled, so all of it shows on a phone. */
function Command({ children }: { children: string }) {
  return (
    <pre data-command className="rounded-md border border-border bg-muted p-3 font-mono text-sm whitespace-pre-wrap wrap-anywhere">
      <code>{children}</code>
    </pre>
  );
}
