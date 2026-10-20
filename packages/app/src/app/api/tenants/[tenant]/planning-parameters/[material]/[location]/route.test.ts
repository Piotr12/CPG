import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const call = (method: "PATCH" | "DELETE", body: unknown) =>
  route[method](
    new Request("http://cpg.test/api/tenants/prod/planning-parameters/00000004/00000001", { method, body: JSON.stringify(body) }),
    { params: Promise.resolve({ tenant: "prod", material: "00000004", location: "00000001" }) },
  );

describe("/api/tenants/{tenant}/planning-parameters/{material}/{location}", () => {
  afterEach(() => vi.clearAllMocks());

  it("PATCH changes the path's set at the version sent", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { planningParameterService: { update: mocks.update } };
    mocks.update.mockResolvedValue({ leadTimeDays: 3, version: 2 });

    const response = await call("PATCH", { leadTimeDays: 3, lotMultiple: "5", version: 1 });

    expect(await response.json()).toEqual({ ok: true, data: { leadTimeDays: 3, version: 2 } });
    expect(mocks.update).toHaveBeenCalledWith(
      "00000004",
      "00000001",
      { leadTimeDays: 3, lotMultiple: "5.000000" },
      1,
      expect.objectContaining({ channel: "api" }),
    );
  });

  it("DELETE removes it at the version in the JSON body", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { planningParameterService: { remove: mocks.remove } };
    mocks.remove.mockResolvedValue({ material: "00000004", location: "00000001" });

    const response = await call("DELETE", { version: 4 });

    expect(await response.json()).toEqual({ ok: true, data: { material: "00000004", location: "00000001" } });
    expect(mocks.remove).toHaveBeenCalledWith("00000004", "00000001", 4, expect.objectContaining({ channel: "api" }));
  });

  it("refuses a change of nothing, a missing version, and a normal user's token", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    expect((await call("PATCH", { version: 1 })).status).toBe(400);
    expect((await call("DELETE", {})).status).toBe(400);

    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };
    expect((await call("PATCH", { leadTimeDays: 3, version: 1 })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
