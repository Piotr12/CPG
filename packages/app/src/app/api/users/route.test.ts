import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteContext } from "../../../auth/api-write";
import { GET, POST } from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const ALICE_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "ci" } as const;

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  requireApiUser: vi.fn(),
  caller: { current: null as unknown },
  options: [] as unknown[],
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({ cradle: { userService: { list: mocks.list } } }),
}));
vi.mock("../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
// apiWrite has its own tests; here it hands the handler the parsed body, a caller and the services.
vi.mock("../../../auth/api-write", async () => {
  const { apiHandler } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
  return {
    apiWrite: (handler: (write: WriteContext<unknown>) => Promise<unknown>, options?: unknown) => {
      mocks.options.push(options);
      return apiHandler(async (request: Request, context: unknown) =>
        handler({
          request,
          context,
          caller: mocks.caller.current as WriteContext<unknown>["caller"],
          body: await request.json(),
          cradle: { userService: { create: mocks.create } } as unknown as WriteContext<unknown>["cradle"],
        }),
      );
    },
  };
});

const USERS = [{ id: "u1", username: "admin", role: "admin", active: true, createdAt: "2026-10-19T09:00:00.000Z", version: 1 }];
const get = () => GET(new Request("http://cpg.test/api/users"), undefined);
const post = (body: unknown) =>
  POST(new Request("http://cpg.test/api/users", { method: "POST", body: JSON.stringify(body) }), undefined);

describe("GET /api/users", () => {
  afterEach(() => vi.clearAllMocks());

  it("lists every account with its version for the admin, by token or session (API-002)", async () => {
    mocks.requireApiUser.mockResolvedValue(ADMIN_TOKEN);
    mocks.list.mockResolvedValue(USERS);

    const response = await get();

    expect(mocks.requireApiUser).toHaveBeenCalledWith(expect.any(Request));
    expect(await response.json()).toEqual({ ok: true, data: USERS });
  });

  it("forbids a normal user's token, as the UI does (API-010)", async () => {
    mocks.requireApiUser.mockResolvedValue(ALICE_TOKEN);

    const response = await get();

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

describe("POST /api/users", () => {
  afterEach(() => vi.clearAllMocks());

  it("is keyed with an argon2 fingerprint, since its body holds a password", () => {
    expect(mocks.options).toEqual([{ secretBody: true }]);
  });

  it("creates a user from the parsed body, audited as the calling token (R07, AUD-007)", async () => {
    mocks.caller.current = ADMIN_TOKEN;
    mocks.create.mockResolvedValue(USERS[0]);

    const response = await post({ username: " Carol ", password: "initial password" });

    expect(await response.json()).toEqual({ ok: true, data: USERS[0] });
    expect(mocks.create).toHaveBeenCalledWith(
      { username: "carol", password: "initial password" },
      { userId: "u1", username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "ops" } },
    );
  });

  it("forbids a normal user before looking at the body", async () => {
    mocks.caller.current = ALICE_TOKEN;

    const response = await post({ username: "x" });

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses an invalid body with its field errors", async () => {
    mocks.caller.current = ADMIN_TOKEN;

    const response = await post({ username: "x", password: "short" });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["password", "username"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
