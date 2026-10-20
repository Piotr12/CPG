import { afterEach, describe, expect, it, vi } from "vitest";
import type { WriteContext } from "../../../auth/api-write";
import * as route from "./route";

const ALICE_TOKEN = { userId: "u2", username: "alice", role: "user", tokenId: "t2", tokenName: "ci" } as const;

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({ cradle: { userPreferenceService: { get: mocks.get } } }),
}));
vi.mock("../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("../../../auth/api-write", async () => {
  const { apiHandler } = await vi.importActual<typeof import("../../../routing/api-handler")>("../../../routing/api-handler");
  return {
    apiWrite: (handler: (write: WriteContext<unknown>) => Promise<unknown>) =>
      apiHandler(async (request: Request, context: unknown) =>
        handler({
          request,
          context,
          caller: ALICE_TOKEN,
          body: await request.json(),
          cradle: { userPreferenceService: { update: mocks.update } } as unknown as WriteContext<unknown>["cradle"],
        }),
      ),
  };
});

const patch = (body: unknown) =>
  route.PATCH(new Request("http://cpg.test/api/preferences", { method: "PATCH", body: JSON.stringify(body) }), undefined);

describe("/api/preferences", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads the caller's own preferences, by token or session", async () => {
    mocks.requireApiUser.mockResolvedValue({ userId: "u2", username: "alice", role: "user", sessionId: "s1" });
    mocks.get.mockResolvedValue({ locale: "pl", theme: "dark" });

    const response = await route.GET(new Request("http://cpg.test/api/preferences"), undefined);

    expect(await response.json()).toEqual({ ok: true, data: { locale: "pl", theme: "dark" } });
    expect(mocks.get).toHaveBeenCalledWith("u2");
  });

  it("PATCH changes only the fields sent, for the caller, audited as the token", async () => {
    mocks.update.mockResolvedValue({ locale: "en", theme: "dark" });

    const response = await patch({ theme: "dark" });

    expect(await response.json()).toEqual({ ok: true, data: { locale: "en", theme: "dark" } });
    expect(mocks.update).toHaveBeenCalledWith("u2", { theme: "dark" }, {
      userId: "u2",
      username: "alice",
      sessionId: null,
      channel: "api",
      token: { id: "t2", name: "ci" },
    });
  });

  it("PATCH refuses an empty or unknown change", async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ theme: "neon" })).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("defines only GET and PATCH", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "PATCH"]);
  });
});
