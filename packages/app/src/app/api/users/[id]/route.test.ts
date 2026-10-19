import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteContext } from "../../../../auth/api-write";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;

const mocks = vi.hoisted(() => ({ setActive: vi.fn(), caller: { current: null as unknown } }));
vi.mock("../../../../auth/api-write", async () => {
  const { apiHandler } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  return {
    apiWrite: (handler: (write: WriteContext<unknown>) => Promise<unknown>) =>
      apiHandler(async (request: Request, context: unknown) =>
        handler({
          request,
          context,
          caller: mocks.caller.current as WriteContext<unknown>["caller"],
          body: await request.json(),
          cradle: { userService: { setActive: mocks.setActive } } as unknown as WriteContext<unknown>["cradle"],
        }),
      ),
  };
});

const patch = (id: string, body: unknown) =>
  route.PATCH(new Request(`http://cpg.test/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe("PATCH /api/users/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("deactivates the path's user at the version sent, audited as the token (R07, API-029)", async () => {
    mocks.caller.current = ADMIN_TOKEN;
    mocks.setActive.mockResolvedValue({ id: "b", active: false, version: 3 });

    const response = await patch("b", { active: false, version: 2, userId: "ignored" });

    expect(await response.json()).toEqual({ ok: true, data: { id: "b", active: false, version: 3 } });
    expect(mocks.setActive).toHaveBeenCalledWith("b", false, 2, {
      userId: "u1",
      username: "admin",
      sessionId: null,
      channel: "api",
      token: { id: "t1", name: "ops" },
    });
  });

  it("requires the version (AUD-025)", async () => {
    mocks.caller.current = ADMIN_TOKEN;

    const response = await patch("b", { active: true });

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors).toHaveProperty("version");
    expect(mocks.setActive).not.toHaveBeenCalled();
  });

  it("passes a stale version's VERSION_CONFLICT and a missing user's 404 through", async () => {
    const { ConflictError, NotFoundError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.caller.current = ADMIN_TOKEN;
    mocks.setActive
      .mockRejectedValueOnce(new ConflictError("Reload and try again.", "VERSION_CONFLICT"))
      .mockRejectedValueOnce(new NotFoundError("NOT_FOUND", "No such user."));

    expect((await patch("b", { active: true, version: 1 })).status).toBe(409);
    expect((await patch("not-a-uuid", { active: true, version: 1 })).status).toBe(404);
  });

  it("forbids a normal user", async () => {
    mocks.caller.current = { ...ADMIN_TOKEN, role: "user" };

    expect((await patch("b", { active: false, version: 1 })).status).toBe(403);
    expect(mocks.setActive).not.toHaveBeenCalled();
  });

  it("only edits: no other method is defined", () => {
    expect(Object.keys(route)).toEqual(["PATCH"]);
  });
});
