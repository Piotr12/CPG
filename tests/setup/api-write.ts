import { vi } from "vitest";

/** What a faked write route runs with: the caller the test picks and the services it stubs. */
export interface FakeWriteState {
  caller: unknown;
  cradle: unknown;
}

type WriteHandler = (write: { request: Request; context: unknown; caller: unknown; body: unknown; cradle: unknown }) => Promise<unknown>;

/**
 * A stand-in for `app/src/auth/api-write.ts` in route tests, for `vi.mock(…, () => fakeApiWrite(state))`:
 * the route's own handler and `authorize` run inside the real `apiHandler`, so its parsing, role
 * check and service calls are what the test sees, without tokens, keys or transactions (which
 * `api-write.test.ts` covers). The body is the request's JSON, or null when empty.
 */
export async function fakeApiWrite(state: FakeWriteState) {
  const { apiHandler } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  const write = (handler: WriteHandler, options?: { authorize?: (caller: unknown) => unknown }) =>
    apiHandler(async (request: Request, context: unknown) => {
      options?.authorize?.(state.caller);
      const text = await request.text();
      const body: unknown = text ? JSON.parse(text) : null;
      return handler({ request, context, caller: state.caller, body, cradle: state.cradle });
    });
  return { apiWrite: write, tenantApiWrite: write };
}
