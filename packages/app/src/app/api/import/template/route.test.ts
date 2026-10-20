import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn() }));
vi.mock("../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

describe("GET /api/import/template", () => {
  afterEach(() => vi.clearAllMocks());

  it("serves the template to any signed-in account as an .xlsx attachment", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });

    const response = await GET(new Request("http://cpg.test/api/import/template"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="cpg-import-template.xlsx"');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]); // "PK": a zip archive
  });

  it("answers 401 in the shared envelope without a credential", async () => {
    const { UnauthorizedError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockRejectedValue(new UnauthorizedError());

    const response = await GET(new Request("http://cpg.test/api/import/template"));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });
});
