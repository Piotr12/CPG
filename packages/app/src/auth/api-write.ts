import {
  apiHandler,
  AppError,
  fingerprintOf,
  operationOf,
  readIdempotencyKey,
  REPLAYED_HEADER,
  requestScope,
  UnauthorizedError,
  type ApiActor,
  type Cradle,
  type IdempotencyScope,
} from "@cpg/core";
import { BEARER_REQUIRED, requireApiUser } from "./require-api-user";

/** What a write handler gets: the token's account, the parsed body, and the services to write with. */
export interface WriteContext<Context> {
  request: Request;
  /** The route's context, as Next.js passes it (`params`). */
  context: Context;
  /** A state-changing request is always a bearer token's: the session cookie only reads. */
  caller: ApiActor;
  /** The parsed JSON body, or null when there is none. Handlers parse it with their own schema. */
  body: unknown;
  /**
   * The request scope's services. Write only through these: they share the transaction the key is
   * stored in. A handler that resolved its own scope would write outside it (`tests/api-writes.test.ts`).
   */
  cradle: Cradle;
}

export interface WriteOptions {
  /** The body carries a password: its stored fingerprint is an argon2id hash (spec Q4). */
  secretBody?: boolean;
}

type Handler<T, Context> = (write: WriteContext<Context>) => Promise<T>;
type Route<Context> = (request: Request, context: Context) => Promise<Response>;

/**
 * Wraps every state-changing route outside a tenant (R07): bearer only (401), an `Idempotency-Key`
 * (400 `IDEMPOTENCY_KEY_REQUIRED`), a JSON body (400), then the handler runs once per key through
 * `IdempotencyService`. A repeat within 24 hours answers the first result with
 * `Idempotent-Replayed: true` and writes nothing; reusing the key for another request is 409.
 */
export function apiWrite<T, Context = unknown>(handler: Handler<T, Context>, options: WriteOptions = {}): Route<Context> {
  return keyedWrite(handler, options, async () => ({ scope: await requestScope(), idempotency: { kind: "global" } }));
}

/**
 * The shared write pipeline. `resolve` picks the request scope and the key store; it runs after the
 * caller and the key are checked, so a bad credential or key never reaches the database.
 */
export function keyedWrite<T, Context>(
  handler: Handler<T, Context>,
  options: WriteOptions,
  resolve: (
    request: Request,
    context: Context,
  ) => Promise<{ scope: { cradle: Cradle }; idempotency: IdempotencyScope }>,
): Route<Context> {
  return async (request, context) => {
    let replayed = false;
    const response = await apiHandler(async (request: Request, context: Context) => {
      const caller = await requireApiUser(request);
      if (!("tokenId" in caller)) throw new UnauthorizedError(BEARER_REQUIRED);
      const key = readIdempotencyKey(request);
      const { scope, idempotency } = await resolve(request, context);
      const body = await readJsonBody(request);
      const write = { method: request.method, path: new URL(request.url).pathname, body };
      const fingerprint = await fingerprintOf(write, { secret: options.secretBody });

      const result = await scope.cradle.idempotencyService.run(
        { userId: caller.userId, key, operation: operationOf(write), fingerprint },
        idempotency,
        () => handler({ request, context, caller, body, cradle: scope.cradle }),
      );
      replayed = result.replayed;
      return result.data;
    })(request, context);
    if (replayed) response.headers.set(REPLAYED_HEADER, "true");
    return response;
  };
}

/** The request body as JSON, or null when it is empty. Anything unparseable is 400. */
async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("VALIDATION_FAILED", "The request body must be JSON.");
  }
}
