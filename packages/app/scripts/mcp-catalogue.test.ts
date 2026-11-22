import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCatalogue, CATALOGUE_PATH, serializeCatalogue } from "../src/api-catalogue/catalogue";

const writeFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:fs", async (importOriginal) => ({ ...(await importOriginal<typeof import("node:fs")>()), writeFileSync }));

describe("scripts/mcp-catalogue.ts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes the built catalogue to mcp/cpg_mcp/catalogue.json at the repository root", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await import("./mcp-catalogue");

    const root = path.resolve(import.meta.dirname, "..", "..", "..");
    expect(writeFileSync).toHaveBeenCalledWith(path.join(root, CATALOGUE_PATH), serializeCatalogue(buildCatalogue()));
    expect(info).toHaveBeenCalledWith("Wrote mcp/cpg_mcp/catalogue.json.");
  });
});
