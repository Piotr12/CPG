import { describe, expect, it } from "vitest";
import { z } from "zod";
import { materialUpdateBodySchema } from "../validators/materials/material-update.schema";
import { orderUpdateBodySchema } from "../validators/purchasing/purchase-order.schema";
import { refusedFieldsNote, toToolJsonSchema } from "./tool-json-schema";

describe("toToolJsonSchema", () => {
  it("describes what the client sends, before transforms, without the dialect line", () => {
    const schema = z.strictObject({
      quantity: z.string().transform((text) => Number(text)),
      page: z.coerce.number().int().min(1).default(1),
    });

    expect(toToolJsonSchema(schema)).toEqual({
      type: "object",
      properties: { quantity: { type: "string" }, page: { type: "integer", minimum: 1, default: 1, maximum: Number.MAX_SAFE_INTEGER } },
      required: ["quantity"],
      additionalProperties: false,
    });
  });

  it("throws on a schema JSON Schema can't express, rather than advertising {}", () => {
    expect(() => toToolJsonSchema(z.object({ at: z.date() }))).toThrow();
    expect(() => toToolJsonSchema(z.bigint())).toThrow();
  });

  it("drops a refused field and names it in the object's description (A10)", () => {
    const json = toToolJsonSchema(materialUpdateBodySchema);

    expect(json.properties).not.toHaveProperty("id");
    expect(json.properties).toHaveProperty("version");
    expect(json.description).toBe("Never send: id.");
    expect(JSON.stringify(json)).not.toContain('"not"');
  });

  it("finds refused fields at any depth, such as a purchase order line's", () => {
    const json = toToolJsonSchema(orderUpdateBodySchema);
    const line = (json.properties as { lines: { items: { properties: object; description: string } } }).lines.items;

    expect(line.description).toMatch(/^Never send: /);
    expect(JSON.stringify(json)).not.toContain('"not"');
    expect(line.properties).toHaveProperty("line");
  });

  it("drops a described refused field too", () => {
    const json = toToolJsonSchema(z.object({ keep: z.string(), gone: z.never().optional().describe("Never.") }));

    expect(json.properties).toEqual({ keep: { type: "string" } });
    expect(json.description).toBe(refusedFieldsNote(["gone"]));
  });

  it("requires nothing of a schema that accepts an empty object, whatever a preprocess renders", () => {
    const filled = z.preprocess((value) => value ?? [], z.array(z.string()));
    const query = z.strictObject({ material: filled, page: z.number().optional() });

    expect(query.safeParse({}).success).toBe(true);
    expect(toToolJsonSchema(query)).not.toHaveProperty("required");
    expect(toToolJsonSchema(z.strictObject({ material: z.array(z.string()) })).required).toEqual(["material"]);
  });

  it("keeps an existing description, and removes a refused field from required", () => {
    const schema = z.object({ keep: z.string(), gone: z.never() }).describe("A body.");

    expect(toToolJsonSchema(schema)).toEqual({
      type: "object",
      description: `A body. ${refusedFieldsNote(["gone"])}`,
      properties: { keep: { type: "string" } },
      required: ["keep"],
    });
  });

  it("leaves a schema without refused fields, or a property named not, as it is", () => {
    const schema = z.object({ not: z.object({}).optional(), list: z.array(z.string()) });

    expect(toToolJsonSchema(schema)).toEqual({
      type: "object",
      properties: { not: { type: "object", properties: {} }, list: { type: "array", items: { type: "string" } } },
      required: ["list"],
    });
  });
});
