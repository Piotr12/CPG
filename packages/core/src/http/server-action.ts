import { z } from "zod";
import { AppError, ValidationError } from "./errors";
import { validationError } from "./parse-input";
import { fail, ok, type Result } from "./result";

/** What the client sees for anything that isn't an `AppError`: no message, no stack. */
export const INTERNAL_ERROR = { code: "INTERNAL", message: "Something went wrong. Try again." } as const;

/**
 * Wraps a server action's work: parses the raw input with `schema`, runs `handler` on the parsed
 * value and maps the outcome to the result envelope. `AppError`s keep their code and message, and
 * a `ValidationError` from the handler (a rule only the service can check) keeps its field errors,
 * so the form shows them by their fields. Anything else is logged and returned as `INTERNAL_ERROR`. Redirects belong to the caller, after
 * an `ok` result, so this layer never depends on Next.js.
 */
export function serverAction<Schema extends z.ZodType, T>(
  schema: Schema,
  handler: (input: z.infer<Schema>) => Promise<T>,
): (raw: unknown) => Promise<Result<T>> {
  return async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const { code, message, fieldErrors } = validationError(parsed.error);
      return fail({ code, message, fieldErrors });
    }
    try {
      return ok(await handler(parsed.data));
    } catch (error) {
      if (error instanceof ValidationError) {
        return fail({ code: error.code, message: error.message, fieldErrors: error.fieldErrors, ...(error.messageParams && { params: error.messageParams }) });
      }
      if (error instanceof AppError) return fail({ code: error.code, message: error.message, ...(error.messageParams && { params: error.messageParams }) });
      console.error("Server action failed:", error);
      return fail(INTERNAL_ERROR);
    }
  };
}
