import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;
const KEY = { material: "00000005", location: "00000001", date: "2027-01-01" };

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  state: { caller: null as unknown, cradle: null as unknown },
}));
vi.mock("../../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const call = (method: "PATCH" | "DELETE", body: unknown) =>
  route[method](
    new Request("http://cpg.test/api/tenants/prod/forecasts/00000005/00000001/2027-01-01", {
      method,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ tenant: "prod", ...KEY }) },
  );

describe("/api/tenants/{tenant}/forecasts/{material}/{location}/{date}", () => {
  afterEach(() => vi.clearAllMocks());

  it("PATCH sets the path's forecast quantity, converted from its unit, at the version sent", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { forecastService: { update: mocks.update } };
    mocks.update.mockResolvedValue({ quantity: "40.000000", version: 2 });

    const response = await call("PATCH", { quantity: "40", unit: "case", version: 1 });

    expect(await response.json()).toEqual({ ok: true, data: { quantity: "40.000000", version: 2 } });
    expect(mocks.update).toHaveBeenCalledWith(KEY, { quantity: "40.000000", unit: "case" }, 1, expect.objectContaining({ channel: "api" }));
  });

  it("DELETE removes it at the version in the JSON body", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { forecastService: { remove: mocks.remove } };
    mocks.remove.mockResolvedValue(KEY);

    const response = await call("DELETE", { version: 2 });

    expect(await response.json()).toEqual({ ok: true, data: KEY });
    expect(mocks.remove).toHaveBeenCalledWith(KEY, 2, expect.objectContaining({ channel: "api" }));
  });

  it("refuses a missing version, and a normal user's token", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    expect((await call("PATCH", { quantity: "40" })).status).toBe(400);
    expect((await call("DELETE", {})).status).toBe(400);

    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };
    expect((await call("DELETE", { version: 1 })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
