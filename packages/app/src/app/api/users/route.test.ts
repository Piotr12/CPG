import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ list: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cpg/core")>();
  return {
    apiHandler: actual.apiHandler,
    assertAdmin: actual.assertAdmin,
    requestScope: async () => ({ cradle: { userService: { list: mocks.list } } }),
  };
});
vi.mock("../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const USERS = [{ id: "u1", username: "admin", role: "admin", active: true, createdAt: "2026-10-19T09:00:00.000Z" }];
const get = () => GET(new Request("http://cpg.test/api/users"), undefined);

describe("GET /api/users", () => {
  afterEach(() => vi.clearAllMocks());

  it("lists every account for the admin, by token or session (API-002)", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u1", username: "admin", role: "admin", tokenId: "t1" });
    mocks.list.mockResolvedValue(USERS);

    const response = await get();

    expect(mocks.requireApiUser).toHaveBeenCalledWith(expect.any(Request));
    expect(await response.json()).toEqual({ ok: true, data: USERS });
  });

  it("forbids a normal user's token, as the UI does (API-010)", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u2", username: "alice", role: "user", tokenId: "t2" });

    const response = await get();

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
