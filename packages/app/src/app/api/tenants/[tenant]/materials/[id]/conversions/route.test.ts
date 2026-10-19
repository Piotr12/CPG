import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const ADMIN_TOKEN = { userId: "u1", username: "admin", role: "admin", tokenId: "t1", tokenName: "ops" } as const;

const mocks = vi.hoisted(() => ({ addConversion: vi.fn(), state: { caller: null as unknown, cradle: null as unknown } }));
vi.mock("../../../../../../../auth/api-write", async () =>
  (await import("../../../../../../../../../../tests/setup/api-write")).fakeApiWrite(mocks.state),
);

const post = (body: unknown) =>
  route.POST(
    new Request("http://cpg.test/api/tenants/test/materials/00000002/conversions", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ tenant: "test", id: "00000002" }) },
  );

describe("POST /api/tenants/{tenant}/materials/{id}/conversions", () => {
  afterEach(() => vi.clearAllMocks());

  it("adds a conversion with a canonical factor to the path's material", async () => {
    mocks.state.caller = ADMIN_TOKEN;
    mocks.state.cradle = { materialService: { addConversion: mocks.addConversion } };
    mocks.addConversion.mockResolvedValue({ unit: "case", numerator: "12", denominator: "1", inverse: "0.083333", version: 1 });

    const response = await post({ unit: "case", numerator: "12.0", denominator: "1" });

    expect((await response.json()).data).toMatchObject({ unit: "case", numerator: "12" });
    expect(mocks.addConversion).toHaveBeenCalledWith(
      "00000002",
      { unit: "case", numerator: "12", denominator: "1" },
      expect.objectContaining({ channel: "api", token: { id: "t1", name: "ops" } }),
    );
  });

  it("refuses a zero denominator and a JSON number, keeping floats out (MAT-022, R03)", async () => {
    mocks.state.caller = ADMIN_TOKEN;

    const response = await post({ unit: "case", numerator: 12, denominator: "0" });

    expect(response.status).toBe(400);
    expect(Object.keys((await response.json()).error.fieldErrors).sort()).toEqual(["denominator", "numerator"]);
    expect(mocks.addConversion).not.toHaveBeenCalled();
  });

  it("forbids a normal user's token", async () => {
    mocks.state.caller = { ...ADMIN_TOKEN, role: "user" };

    expect((await post({ unit: "case", numerator: "12", denominator: "1" })).status).toBe(403);
  });
});
