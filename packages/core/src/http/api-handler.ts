import { AppError, ValidationError } from "./errors";
import { fail, ok, type Result } from "./result";
import { INTERNAL_ERROR } from "./server-action";

/** API responses are per account and per request; nothing may cache them. */
const NO_STORE = { "Cache-Control": "no-store" };

const respond = (body: Result<unknown>, status: number) => Response.json(body, { status, headers: NO_STORE });

/**
 * Throws the errors the web framework uses for control flow (a redirect, a not-found, the end of a
 * build-time prerender) and returns for anything else. In the app, Next.js's `unstable_rethrow`.
 */
export type Rethrow = (error: unknown) => void;

/**
 * Builds the route-handler wrapper. Core stays framework-agnostic, so the app passes the framework's
 * `rethrow` and routes import the result (`app/src/routing/api-handler.ts`), never this directly.
 *
 * The wrapper: the handler's result becomes `200 { ok: true, data }`; an `AppError` becomes its own
 * status with `{ ok: false, error }`, keeping its code; a framework control-flow error propagates
 * untouched; anything else is logged and becomes `500 INTERNAL`. The shared result envelope keeps
 * API errors stable (API-018).
 */
export function createApiHandler(rethrow: Rethrow) {
  return function apiHandler<T, Context = unknown>(
    handler: (request: Request, context: Context) => Promise<T>,
  ): (request: Request, context: Context) => Promise<Response> {
    return async (request, context) => {
      try {
        return respond(ok(await handler(request, context)), 200);
      } catch (error) {
        rethrow(error);
        if (error instanceof ValidationError) {
          return respond(fail({ code: error.code, message: error.message, fieldErrors: error.fieldErrors, ...(error.messageParams && { params: error.messageParams }) }), error.status);
        }
        if (error instanceof AppError) return respond(fail({ code: error.code, message: error.message, ...(error.messageParams && { params: error.messageParams }) }), error.status);
        console.error("Route handler failed:", error);
        return respond(fail(INTERNAL_ERROR), 500);
      }
    };
  };
}
