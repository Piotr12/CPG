import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HELP_TOPIC_IDS } from "../help/topics";
import { buildCatalogue, CATALOGUE_PATH, serializeCatalogue } from "./catalogue";
import { API_OPERATIONS, type ApiOperation } from "./operations";

const committed = () => readFileSync(path.resolve(import.meta.dirname, "..", "..", "..", "..", CATALOGUE_PATH), "utf8");

const operation = (extra: Partial<ApiOperation> = {}): ApiOperation => ({
  id: "things.update",
  method: "PATCH",
  path: "/api/tenants/{tenant}/things/{id}",
  role: "admin",
  write: "tenant",
  summary: "Edits a thing.",
  ...extra,
});

describe("buildCatalogue", () => {
  it("is what mcp/cpg_mcp/catalogue.json holds: run `npm run mcp:catalogue` and commit the result", () => {
    expect(committed()).toBe(serializeCatalogue(buildCatalogue()));
  });

  it("converts every registry entry's schemas, so no entry advertises an empty schema", () => {
    const { operations } = buildCatalogue();

    expect(operations.map(({ id }) => id)).toEqual(API_OPERATIONS.map(({ id }) => id));
    const withSchema = API_OPERATIONS.filter(({ body, query }) => body ?? query).length;
    expect(operations.filter(({ body, query }) => body ?? query)).toHaveLength(withSchema);
    expect(operations.filter(({ body, query }) => [body, query].some((schema) => schema && Object.keys(schema).length === 0))).toEqual([]);
  });

  it("describes an operation's path parameters, write contract and schemas", () => {
    const [entry] = buildCatalogue([operation({ body: z.strictObject({ version: z.number().int() }) })]).operations;

    expect(entry).toEqual({
      id: "things.update",
      method: "PATCH",
      path: "/api/tenants/{tenant}/things/{id}",
      pathParams: ["tenant", "id"],
      role: "admin",
      write: "tenant",
      summary: "Edits a thing.",
      body: {
        type: "object",
        properties: { version: { type: "integer", minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER } },
        required: ["version"],
        additionalProperties: false,
      },
    });
    expect(buildCatalogue([operation({ method: "GET", write: null, query: z.object({ q: z.string().optional() }) })]).operations[0]).toMatchObject({
      query: { type: "object", properties: { q: { type: "string" } } },
    });
    expect(buildCatalogue([operation()]).operations[0]).not.toHaveProperty("body");
  });

  it("bundles every help topic in English and Polish", () => {
    const { help } = buildCatalogue();

    expect(help.en.map(({ id }) => id)).toEqual([...HELP_TOPIC_IDS]);
    expect(help.pl.map(({ id }) => id)).toEqual([...HELP_TOPIC_IDS]);
    expect(help.pl.find(({ id }) => id === "mrp")?.title).not.toBe(help.en.find(({ id }) => id === "mrp")?.title);
  });

  it("hashes what it describes, so a changed schema changes generatedFrom", () => {
    const before = buildCatalogue([operation({ body: z.object({ name: z.string() }) })]);
    const after = buildCatalogue([operation({ body: z.object({ name: z.string().max(10) }) })]);

    expect(before.generatedFrom).toMatch(/^[0-9a-f]{64}$/);
    expect(after.generatedFrom).not.toBe(before.generatedFrom);
    expect(buildCatalogue([operation({ body: z.object({ name: z.string() }) })]).generatedFrom).toBe(before.generatedFrom);
  });

  it("fails on a schema the catalogue can't express", () => {
    expect(() => buildCatalogue([operation({ body: z.object({ at: z.date() }) })])).toThrow();
  });

  it("serializes as two-space JSON with a final newline", () => {
    const text = serializeCatalogue(buildCatalogue([operation()]));
    expect(text.endsWith("}\n")).toBe(true);
    expect(text).toContain('\n  "generatedFrom": ');
  });
});
