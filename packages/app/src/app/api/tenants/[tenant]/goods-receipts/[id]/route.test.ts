import { afterEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";

const mocks = vi.hoisted(() => ({ get: vi.fn(), tenantScope: vi.fn(), requireApiUser: vi.fn() }));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../../../auth/require-api-user", () => ({ requireApiUser: mocks.requireApiUser }));

const context = (tenant: string, id: string) => ({ params: Promise.resolve({ tenant, id }) });
const get = () => route.GET(new Request("http://cpg.test/api/tenants/test/goods-receipts/00000002"), context("test", "00000002"));

describe("/api/tenants/{tenant}/goods-receipts/{id}", () => {
  afterEach(() => vi.clearAllMocks());

  it("GET reads one receipt through the tenant's scope, for any signed-in account", async () => {
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { goodsReceiptService: { get: mocks.get } } });
    mocks.get.mockResolvedValue({ id: "00000002" });

    expect(await (await get()).json()).toEqual({ ok: true, data: { id: "00000002" } });
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.get).toHaveBeenCalledWith("00000002");
  });

  it("GET answers 404 for a receipt this tenant doesn't have", async () => {
    const { NotFoundError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.requireApiUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({ cradle: { goodsReceiptService: { get: mocks.get } } });
    mocks.get.mockRejectedValue(new NotFoundError("GOODS_RECEIPT_NOT_FOUND", "There is no goods receipt 00000002 in this tenant."));

    const response = await get();
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("GOODS_RECEIPT_NOT_FOUND");
  });
});
