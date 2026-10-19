import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;

const mocks = vi.hoisted(() => ({
  changeConversion: vi.fn(),
  removeConversion: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("../../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const call = (method: "PATCH" | "DELETE", unit: string, body: unknown) =>
  route[method](
    new Request(`http://cpg.test/api/tenants/prod/materials/00000002/conversions/${encodeURIComponent(unit)}`, {
      method,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ tenant: "prod", id: "00000002", unit }) },
  );

describe("/api/tenants/{tenant}/materials/{id}/conversions/{unit}", () => {
  afterEach(() => vi.clearAllMocks());

  it("PATCH changes the path's conversion at the version sent", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { materialService: { changeConversion: mocks.changeConversion } };
    mocks.changeConversion.mockResolvedValue({ unit: "szt.", version: 2 });

    const response = await call("PATCH", "szt.", { numerator: "10", denominator: "1", version: 1 });

    expect(await response.json()).toEqual({ ok: true, data: { unit: "szt.", version: 2 } });
    expect(mocks.changeConversion).toHaveBeenCalledWith(
      "00000002",
      "szt.",
      { numerator: "10", denominator: "1" },
      1,
      expect.objectContaining({ channel: "api" }),
    );
  });

  it("DELETE removes it at the version in the JSON body", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { materialService: { removeConversion: mocks.removeConversion } };
    mocks.removeConversion.mockResolvedValue({ unit: "płyta" });

    const response = await call("DELETE", "płyta", { version: 4 });

    expect(await response.json()).toEqual({ ok: true, data: { unit: "płyta" } });
    expect(mocks.removeConversion).toHaveBeenCalledWith("00000002", "płyta", 4, expect.objectContaining({ channel: "api" }));
  });

  it("refuses a missing version, and a normal user's token", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    expect((await call("DELETE", "case", {})).status).toBe(400);
    expect((await call("PATCH", "case", { numerator: "10", denominator: "1" })).status).toBe(400);

    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };
    expect((await call("DELETE", "case", { version: 1 })).status).toBe(403);
    expect(mocks.removeConversion).not.toHaveBeenCalled();
    expect(mocks.changeConversion).not.toHaveBeenCalled();
  });
});
