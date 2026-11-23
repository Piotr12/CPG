import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_SKILL, fixturePackage } from "../../../../agent-downloads/mcp-package-fixture";

const { connection } = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock("next/server", () => ({ connection }));

describe("GET /downloads/cpg-onboarding/SKILL.md", () => {
  afterEach(() => vi.restoreAllMocks());

  it("serves the skill's text as Markdown, read at request time and checked again on every use", async () => {
    const root = fixturePackage();
    vi.spyOn(process, "cwd").mockReturnValue(path.join(path.dirname(root), "packages", "app"));
    vi.resetModules();
    const { GET } = await import("./route");

    const response = await GET();

    expect(connection).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(await response.text()).toBe(FIXTURE_SKILL);
  });
});
