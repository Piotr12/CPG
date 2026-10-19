import { z } from "zod";
import { ValidationError, type FieldErrors } from "./errors";

/** A failed parse as the `ValidationError` every wrapper maps to `VALIDATION_FAILED`. */
export function validationError(error: z.ZodError): ValidationError {
  const { fieldErrors } = z.flattenError(error) as { fieldErrors: FieldErrors };
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
