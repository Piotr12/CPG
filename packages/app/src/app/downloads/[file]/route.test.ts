import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixturePackage } from "../../../agent-downloads/mcp-package-fixture";

const { connection } = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock("next/server", () => ({ connection }));

/** The route and the current archive name, built from a fresh fixture package in a fresh module. */
async function load() {
  const root = fixturePackage();
  vi.spyOn(process, "cwd").mockReturnValue(path.join(path.dirname(root), "packages", "app"));
  vi.resetModules();
  const [{ GET }, { agentDownloads }] = await Promise.all([import("./route"), import("../../../agent-downloads/downloads")]);
  return { GET, current: agentDownloads().mcp.fileName };
}

const request = (file: string) => [new Request(`http://localhost/downloads/${file}`), { params: Promise.resolve({ file }) }] as const;

describe("GET /downloads/[file]", () => {
  let route: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    route = await load();
  });
  afterEach(() => vi.restoreAllMocks());

  it("serves the package archive under its current hash as an immutable attachment, at request time", async () => {
    const response = await route.GET(...request(route.current));

    expect(connection).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="${route.current}"`);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer())))).toContain("cpg-mcp/pyproject.toml");
  });

  it("redirects any other hash to the current archive, with a relative 307", async () => {
    const response = await route.GET(...request("cpg-mcp-000000000000.zip"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(`/downloads/${route.current}`);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("serves the skill archive as an attachment that is checked again on every use", async () => {
    const response = await route.GET(...request("cpg-onboarding-skill.zip"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="cpg-onboarding-skill.zip"');
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer())))).toEqual(["cpg-onboarding/SKILL.md"]);
  });

  it.each(["cpg-mcp-latest.zip", "cpg-mcp-0123456789AB.zip", "SKILL.md", "pyproject.toml", "cpg-onboarding"])("answers 404 for %s", async (file) => {
    const response = await route.GET(...request(file));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });
});
