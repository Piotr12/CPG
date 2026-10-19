import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteContext } from "../../../../auth/api-write";
import * as route from "./route";

const mocks = vi.hoisted(() => ({ revoke: vi.fn() }));
// apiWrite has its own tests; here it hands the handler a fixed caller and cradle.
vi.mock("../../../../auth/api-write", () => ({
  apiWrite:
    (handler: (write: WriteContext<unknown>) => Promise<unknown>) =>
    async (request: Request, context: unknown) =>
      Response.json(
        await handler({
          request,
          context,
          caller: { userId: "u2", username: "alice", role: "user", tokenId: "t9", tokenName: "ci" },
          body: null,
          cradle: { apiTokenService: { revoke: mocks.revoke } } as unknown as WriteContext<unknown>["cradle"],
        }),
      ),
}));

const remove = (id: string) =>
  route.DELETE(new Request(`http://cpg.test/api/tokens/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

describe("DELETE /api/tokens/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("revokes the path's token for the calling account, naming its own token in the audit (API-008, AUD-007)", async () => {
    mocks.revoke.mockResolvedValue({ id: "t1" });

    const response = await remove("t1");

    expect(mocks.revoke).toHaveBeenCalledWith("u2", "t1", {
      userId: "u2",
      username: "alice",
      sessionId: null,
      channel: "api",
      token: { id: "t9", name: "ci" },
    });
    expect(await response.json()).toEqual({ id: "t1" });
  });

  it("only revokes: no other method is defined", () => {
    expect(Object.keys(route)).toEqual(["DELETE"]);
  });
});
