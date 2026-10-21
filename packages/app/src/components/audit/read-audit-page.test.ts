import { afterEach, describe, expect, it, vi } from "vitest";
import { readAuditPage } from "./read-audit-page";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

const CURSOR = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";
const page = { entries: [], nextBefore: null };
const core = () => vi.importActual<typeof import("@cpg/core")>("@cpg/core");

describe("readAuditPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("reads the first page by default", async () => {
    const list = vi.fn().mockResolvedValue(page);

    await expect(readAuditPage(Promise.resolve({}), list)).resolves.toEqual({ page, isFirstPage: true, query: {}, invalid: [] });
    expect(list).toHaveBeenCalledWith({ limit: 50 });
  });

  it("reads the page before a cursor", async () => {
    const list = vi.fn().mockResolvedValue(page);

    await expect(readAuditPage(Promise.resolve({ before: CURSOR }), list)).resolves.toEqual({ page, isFirstPage: false, query: {}, invalid: [] });
    expect(list).toHaveBeenCalledWith({ before: CURSOR, limit: 50 });
  });

  it("reads the filtered page and returns the filters, without the page position", async () => {
    const list = vi.fn().mockResolvedValue(page);

    await expect(readAuditPage(Promise.resolve({ before: CURSOR, subjectType: "PurchaseOrder", subjectId: "00000012", channel: "" }), list)).resolves.toEqual({
      page, isFirstPage: false, query: { subjectType: "PurchaseOrder", subjectId: "00000012" }, invalid: [],
    });
    expect(list).toHaveBeenCalledWith({ before: CURSOR, limit: 50, subjectType: "PurchaseOrder", subjectId: "00000012" });
  });

  it.each([
    [{ subjectId: "00000012", channel: "api" }, ["subjectId"], { subjectId: "00000012", channel: "api" }],
    [{ from: "2026-10-21", to: "2026-10-01" }, ["to"], { from: "2026-10-21", to: "2026-10-01" }],
    [{ channel: "web", account: [" alice ", "bob"] }, ["account", "channel"], { account: "alice" }],
    [{ subjectType: "Purchase-Order", from: "2026-02-30" }, ["subjectType", "from"], { subjectType: "Purchase-Order", from: "2026-02-30" }],
  ])("reads nothing for refused filters %j and returns them, as sent, for the form to explain", async (params, invalid, query) => {
    const list = vi.fn();

    await expect(readAuditPage(Promise.resolve(params), list)).resolves.toEqual({ page: { entries: [], nextBefore: null }, isFirstPage: true, query, invalid });
    expect(list).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it.each([{ before: "nope" }, { before: "nope", channel: "web" }, { before: [CURSOR, CURSOR] }, { limit: "0" }])(
    "renders not-found for a query that names no page: %j",
    async (query) => {
      const list = vi.fn();

      await expect(readAuditPage(Promise.resolve(query), list)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
      expect(list).not.toHaveBeenCalled();
    },
  );

  it("renders not-found for a cursor this audit doesn't hold", async () => {
    const list = vi.fn().mockRejectedValue((await core()).auditCursorNotFound());

    await expect(readAuditPage(Promise.resolve({ before: CURSOR }), list)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("lets any other failure through", async () => {
    const list = vi.fn().mockRejectedValue(new Error("disk full"));

    await expect(readAuditPage(Promise.resolve({}), list)).rejects.toThrow("disk full");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
