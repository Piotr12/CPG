import { z } from "zod";

/** A JSON Schema document, as `z.toJSONSchema` returns it, without the `$schema` dialect line. */
export type ToolJsonSchema = { [key: string]: unknown };

/**
 * What `z.toJSONSchema` makes of a refused field, `z.never().optional()` (lesson 2026-10-20): `not: {}`, with the
 * field's description when it has one.
 */
const isRefused = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  "not" in value &&
  isEmptyObject(value.not) &&
  Object.keys(value).every((key) => key === "not" || key === "description");

const isEmptyObject = (value: unknown) => typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;

/** The sentence a schema with refused fields gets, so a model learns why they are absent. */
export const refusedFieldsNote = (fields: string[]) => `Never send: ${fields.join(", ")}.`;

/**
 * An API input schema as the JSON Schema a tool advertises (spec `2026-11-22--0818UTC-local-mcp-server`,
 * Architecture): what a client sends (`io: "input"`, so decimal strings and dates before their transforms),
 * failing on anything JSON Schema can't express rather than advertising `{}`. A refused field renders as
 * `not: {}`, which tells a model nothing, so it is dropped and named in its object's description instead
 * (A10). A schema that accepts an empty object requires nothing: a `z.preprocess` that fills an absent field in
 * renders its inner schema, which would otherwise list the field as required (the demand review's `material`).
 * Refinements don't appear: the server's validation stays the authority.
 */
export function toToolJsonSchema(schema: z.ZodType): ToolJsonSchema {
  const json: ToolJsonSchema = { ...z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" }) };
  delete json.$schema;
  if (schema.safeParse({}).success) delete json.required;
  return withoutRefusedFields(json) as ToolJsonSchema;
}

/** Every object schema in `node`, at any depth, with its refused properties moved into its description. */
function withoutRefusedFields(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutRefusedFields);
  if (typeof node !== "object" || node === null) return node;
  const copy = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, withoutRefusedFields(value)]));
  if (!isPropertyMap(copy.properties)) return copy;

  const refused = Object.keys(copy.properties).filter((name) => isRefused((copy.properties as Record<string, unknown>)[name]));
  if (refused.length === 0) return copy;
  const properties = Object.fromEntries(Object.entries(copy.properties).filter(([name]) => !refused.includes(name)));
  const note = refusedFieldsNote(refused);
  const description = typeof copy.description === "string" ? `${copy.description} ${note}` : note;
  const result: Record<string, unknown> = { ...copy, properties, description };
  if (Array.isArray(copy.required)) result.required = copy.required.filter((name) => !refused.includes(name as string));
  return result;
}

const isPropertyMap = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
