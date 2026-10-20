import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postIssue } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const issue = { id: "00000003" };
const FORM = { lines: [{ line: 1, quantity: "20", unit: "each" }] };

const mocks = vi.hoisted(() => ({
  goodsIssueService: { post: vi.fn() },
  bound: vi.fn(),
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
// tenantServerAction's tenant, generation and transaction are core's (tenant-server-action.test.ts);
// here it parses and runs the handler as serverAction does, and records what the page bound.
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return {
    ...core,
    tenantServerAction:
      (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (tenant: string, generation: number, raw: unknown) => {
        mocks.bound(tenant, generation);
        return core.serverAction(schema, (input) => handler(input, { cradle: { goodsIssueService: mocks.goodsIssueService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("shipment page actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.goodsIssueService.post.mockResolvedValue(issue);
  });
  afterEach(() => vi.clearAllMocks());

  it("posts an issue against the page's shipment for any signed-in account, and refreshes the shipment, its order, the order list and stock", async () => {
    await expect(postIssue("prod", 4, "00000002", "00000007", FORM)).resolves.toEqual({ ok: true, data: issue });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 4);
    expect(mocks.goodsIssueService.post).toHaveBeenCalledWith({ shipment: "00000002", lines: FORM.lines }, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/admin/prod/shipments/00000002"],
      ["/admin/prod/customer-orders/00000007"],
      ["/admin/prod/customer-orders"],
      ["/admin/prod/stock"],
    ]);
  });

  it("takes the shipment from the page, never from the form", async () => {
    await postIssue("prod", 4, "00000002", "00000007", { ...FORM, shipment: "00000009" });

    expect(mocks.goodsIssueService.post).toHaveBeenCalledWith(expect.objectContaining({ shipment: "00000002" }), aliceActor);
  });

  it("refuses a signed-out caller and values that aren't a form, writing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(postIssue("prod", 4, "00000002", "00000007", FORM)).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    mocks.currentUser.mockResolvedValue(alice);
    await expect(postIssue("prod", 4, "00000002", "00000007", null)).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", fieldErrors: { lines: [expect.any(String)] } } });

    expect(mocks.goodsIssueService.post).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a stock refusal or a read-only one", async () => {
    mocks.goodsIssueService.post.mockRejectedValueOnce(new ConflictError("Short.", "INSUFFICIENT_STOCK"));
    await expect(postIssue("prod", 4, "00000002", "00000007", FORM)).resolves.toMatchObject({ error: { code: "INSUFFICIENT_STOCK" } });
    mocks.goodsIssueService.post.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));
    await expect(postIssue("prod", 4, "00000002", "00000007", FORM)).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
