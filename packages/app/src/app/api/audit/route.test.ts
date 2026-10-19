import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ listGlobal: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return {
    apiHandler: core.apiHandler,
    parseInput: core.parseInput,
    requestScope: async () => ({ cradle: { auditService: { listGlobal: mocks.listGlobal } } }),
  };
});
vi.mock("../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const core = () => vi.importActual<typeof import("@cpg/core")>("@cpg/core");
const CURSOR = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";
const page = {
  entries: [{ id: CURSOR, occurredAt: new Date("2026-10-19T12:00:00Z"), action: "users.user.created" }],
  nextBefore: null,
};
const get = (query = "") => GET(new Request(`http://cpg.test/api/audit${query}`), undefined);

describe("GET /api/audit", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns a page of the Global audit to any signed-in account, dates as ISO strings (AUD-009)", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.listGlobal.mockResolvedValue(page);

    const response = await get(`?before=${CURSOR}&limit=10`);

    expect(response.status).toBe(200);
    expect(mocks.listGlobal).toHaveBeenCalledWith({ before: CURSOR, limit: 10 });
    expect(await response.json()).toEqual({
      ok: true,
      data: { entries: [{ ...page.entries[0], occurredAt: "2026-10-19T12:00:00.000Z" }], nextBefore: null },
    });
  });

  it("uses the default page without a query", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.listGlobal.mockResolvedValue(page);

    await get();

    expect(mocks.listGlobal).toHaveBeenCalledWith({ limit: 50 });
  });

  it("answers a bad query with 400 VALIDATION_FAILED", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });

    const response = await get("?limit=1000");

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
    expect(mocks.listGlobal).not.toHaveBeenCalled();
  });

  it("answers an unknown cursor with 404 AUDIT_CURSOR_NOT_FOUND", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.listGlobal.mockRejectedValue((await core()).auditCursorNotFound());

    const response = await get(`?before=${CURSOR}`);

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("AUDIT_CURSOR_NOT_FOUND");
  });

  it("refuses an anonymous caller with 401 before reading anything", async () => {
    mocks.requireApiUser.mockRejectedValue(new (await core()).UnauthorizedError());

    const response = await get();

    expect(response.status).toBe(401);
    expect(mocks.listGlobal).not.toHaveBeenCalled();
  });
});
