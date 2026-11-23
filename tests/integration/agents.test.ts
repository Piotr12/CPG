import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, expectTitle, openBrowser, type Browser } from "./browser";
import { signedOutLayoutSettled } from "./sign-in";

const baseUrl = inject("baseUrl");

/** The shown homepage's agent section (Next keeps earlier pages mounted but hidden). */
const AGENTS_SECTION = `[...document.querySelectorAll("[data-home-agents]")].find((section) => section.offsetParent && !section.closest("[hidden]"))`;
/** The guide's shown content, with the system it shows. */
const GUIDE = `[...document.querySelectorAll("[data-os]")].find((guide) => guide.offsetParent && !guide.closest("[hidden]"))`;

async function download(path: string) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

let archivePath: Promise<string> | undefined;
/** The MCP package archive's path, as the homepage's download link names it (its hash changes with the package). */
const currentArchive = () =>
  (archivePath ??= fetch(`${baseUrl}/`)
    .then((response) => response.text())
    .then((html) => html.match(/\/downloads\/cpg-mcp-[0-9a-f]{12}\.zip/)![0]));

// #398: the MCP server and the onboarding skill, downloadable from the homepage, with an install guide.
describe("using CPG from an AI agent", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(() => browser.close());

  it("offers both downloads on the homepage and links the install guide", async () => {
    await browser.open(`${baseUrl}/`);
    await browser.waitUntil(`${signedOutLayoutSettled} && Boolean(${AGENTS_SECTION})`);

    const links = await browser.evaluate<[string, string][]>(`[...${AGENTS_SECTION}.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")])`);
    expect(links.map(([text]) => text)).toEqual(["Download the MCP server", "Download the skill", "How to install"]);
    expect(links[0][1]).toMatch(/^\/downloads\/cpg-mcp-[0-9a-f]{12}\.zip$/);
    expect(links.slice(1).map(([, href]) => href)).toEqual(["/downloads/cpg-onboarding-skill.zip", "/agents"]);
    expect(links[0][1]).toBe(await currentArchive());
  });

  it("serves the MCP package as a zip uvx can install, holding the package and the skill", async () => {
    const { response, bytes } = await download(await currentArchive());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const entries = unzipSync(bytes);
    expect(Object.keys(entries)).toEqual(expect.arrayContaining(["cpg-mcp/pyproject.toml", "cpg-mcp/README.md", "cpg-mcp/cpg_mcp/catalogue.json", "cpg-mcp/cpg_mcp/skills/cpg-onboarding/SKILL.md"]));
    expect(Object.keys(entries).filter((name) => name.includes("__pycache__") || !name.startsWith("cpg-mcp/"))).toEqual([]);
    expect(strFromU8(entries["cpg-mcp/pyproject.toml"])).toContain('name = "cpg-mcp"');
  });

  it("redirects an old hash to the current archive", async () => {
    const { response } = await download("/downloads/cpg-mcp-000000000000.zip");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(await currentArchive());
  });

  it("serves the skill as a zip holding its folder, and as the raw file", async () => {
    const zip = await download("/downloads/cpg-onboarding-skill.zip");
    const raw = await download("/downloads/cpg-onboarding/SKILL.md");

    expect(zip.response.status).toBe(200);
    expect(Object.keys(unzipSync(zip.bytes))).toEqual(["cpg-onboarding/SKILL.md"]);
    expect(raw.response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(strFromU8(raw.bytes)).toBe(strFromU8(unzipSync(zip.bytes)["cpg-onboarding/SKILL.md"]));
    expect(strFromU8(raw.bytes)).toMatch(/^---\nname: cpg-onboarding\n/);
  });

  it("answers 404 for any other download", async () => {
    expect((await download("/downloads/secrets.txt")).response.status).toBe(404);
  });

  it("opens the guide from the homepage and switches systems by link, with commands for this CPG", async () => {
    await browser.open(`${baseUrl}/`);
    await browser.waitUntil(`${signedOutLayoutSettled} && Boolean(${AGENTS_SECTION})`);
    await clickHydrated(browser, `[data-home-agents] a[href='/agents']`);
    await browser.waitUntil(`location.pathname === "/agents" && Boolean(${GUIDE})`);
    await expectTitle(browser, "Use CPG from an AI agent · Caveman Planning Good");

    for (const [os, name, uv] of [
      ["windows", "Windows", "powershell -ExecutionPolicy ByPass"],
      ["linux", "Linux", "curl -LsSf https://astral.sh/uv/install.sh | sh"],
    ] as const) {
      await clickHydrated(browser, `nav a[href='/agents?os=${os}']`);
      await browser.waitUntil(`${GUIDE}?.getAttribute("data-os") === ${JSON.stringify(os)}`);

      expect(await browser.evaluate<string>(`${GUIDE}.closest("main").querySelector("[aria-current=page]").textContent`)).toBe(name);
      const commands = await browser.evaluate<string[]>(`[...${GUIDE}.querySelectorAll("[data-command]")].map((block) => block.textContent)`);
      expect(commands.some((command) => command.startsWith(uv))).toBe(true);
      expect(commands.find((command) => command.startsWith("claude mcp add"))).toContain(`${baseUrl}${await currentArchive()}`);
    }
  });
});
