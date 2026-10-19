import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteContext } from "../../../../../auth/api-write";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;

const mocks = vi.hoisted(() => ({ resetPassword: vi.fn(), options: [] as unknown[], caller: { current: null as unknown } }));
vi.mock("../../../../../auth/api-write", async () => {
  const { apiHandler } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  return {
    apiWrite: (handler: (write: WriteContext<unknown>) => Promise<unknown>, options?: unknown) => {
      mocks.options.push(options);
      return apiHandler(async (request: Request, context: unknown) => {
        (options as { authorize?: (c: unknown) => unknown } | undefined)?.authorize?.(mocks.caller.current);
        return handler({
          request,
          context,
          caller: mocks.caller.current as WriteContext<unknown>["caller"],
          body: await request.json(),
          cradle: { userService: { resetPassword: mocks.resetPassword } } as unknown as WriteContext<unknown>["cradle"],
        });
      });
    },
  };
});

const put = (id: string, body: unknown) =>
  route.PUT(new Request(`http://cpg.test/api/users/${id}/password`, { method: "PUT", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe("PUT /api/users/{id}/password", () => {
  afterEach(() => mocks.resetPassword.mockReset());

  it("is keyed with an argon2 fingerprint, and authorized before any hashing", () => {
    expect(mocks.options).toEqual([{ secretBody: true, authorize: expect.any(Function) }]);
  });

  it("resets the path's user at the version sent, audited as the token (R06, R07)", async () => {
    mocks.caller.current = ADMIN_TOKEN;
    mocks.resetPassword.mockResolvedValue({ id: "b", version: 5 });

    const response = await put("b", { password: "a brand new password", version: 4 });

    expect(await response.json()).toEqual({ ok: true, data: { id: "b", version: 5 } });
    expect(mocks.resetPassword).toHaveBeenCalledWith("b", "a brand new password", 4, {
      userId: "u1",
      username: "admin",
      sessionId: null,
      channel: "api",
      token: { id: "t1", name: "ops" },
    });
  });

  it("refuses a short password and a missing version", async () => {
    mocks.caller.current = ADMIN_TOKEN;

    const response = await put("b", { password: "short" });

    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["password", "version"]);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("forbids a normal user", async () => {
    mocks.caller.current = { ...ADMIN_TOKEN, role: "user" };

    expect((await put("b", { password: "a brand new password", version: 1 })).status).toBe(403);
    expect(mocks.resetPassword).not.toHaveBeenCalled();
  });

  it("only resets: no other method is defined", () => {
    expect(Object.keys(route)).toEqual(["PUT"]);
  });
});
