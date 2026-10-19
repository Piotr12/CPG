import { AppError, ValidationError } from "./errors";
import { fail, ok, type Result } from "./result";
import { INTERNAL_ERROR } from "./server-action";

/** API responses are per account and per request; nothing may cache them. */
const NO_STORE = { "Cache-Control": "no-store" };

const respond = (body: Result<unknown>, status: number) => Response.json(body, { status, headers: NO_STORE });

/**
 * Wraps a route handler: its result becomes `200 { ok: true, data }`; an `AppError` becomes its own
 * status with `{ ok: false, error }`, keeping its code; anything else is logged and becomes
 * `500 INTERNAL`. The shared result envelope keeps API errors stable (API-018).
 */
export function apiHandler<T, Context = unknown>(
  handler: (request: Request, context: Context) => Promise<T>,
): (request: Request, context: Context) => Promise<Response> {
  return async (request, context) => {
    try {
      return respond(ok(await handler(request, context)), 200);
    } catch (error) {
      if (error instanceof ValidationError) {
        return respond(fail({ code: error.code, message: error.message, fieldErrors: error.fieldErrors }), error.status);
      }
      if (error instanceof AppError) return respond(fail({ code: error.code, message: error.message }), error.status);
      console.error("Route handler failed:", error);
      return respond(fail(INTERNAL_ERROR), 500);
    }
  };
}
