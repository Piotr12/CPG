import { z } from "zod";
import { ValidationError, type FieldErrors } from "./errors";

/**
 * A failed parse as the `ValidationError` every wrapper maps to `VALIDATION_FAILED`. Each message is
 * keyed by its field's full path, so a list's item gets its own key (`components.2.unit`, a BOM
 * line) and a form can show it on that row; a top-level field keeps its plain name. An issue about
 * the input as a whole has no field and isn't listed.
 */
export function validationError(error: z.ZodError): ValidationError {
  const fieldErrors: FieldErrors = {};
  for (const { path, message } of error.issues) {
    if (path.length === 0) continue;
    const key = path.map(String).join(".");
    fieldErrors[key] = [...(fieldErrors[key] ?? []), message];
  }
  return new ValidationError(fieldErrors);
}

/**
 * Parses untrusted input (a query string, a route parameter) with `schema`, or throws a
 * `ValidationError`. For route handlers and pages; server actions get the same through
 * `serverAction`.
 */
export function parseInput<Schema extends z.ZodType>(schema: Schema, raw: unknown): z.output<Schema> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}
