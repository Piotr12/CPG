import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import TenantAuditPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  listTenant: vi.fn(),
  reversalLinks: vi.fn(),
  usernames: vi.fn(),
  tenantScope: vi.fn(),
  requireUser: vi.fn(),
  getMessages: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const core = () => vi.importActual<typeof import("@cpg/core")>("@cpg/core");
const page = (tenant: string, searchParams: Record<string, string> = {}) =>
  TenantAuditPage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve(searchParams) });

describe("TenantAuditPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.tenantScope.mockResolvedValue({
      cradle: {
        tenant: { code: "test", name: "Test", generation: 1 },
        auditService: { listTenant: mocks.listTenant, reversalLinks: mocks.reversalLinks },
        userService: { usernames: mocks.usernames },
      },
    });
    mocks.listTenant.mockResolvedValue({ entries: [], nextBefore: null });
    mocks.reversalLinks.mockResolvedValue([]);
    mocks.usernames.mockResolvedValue(["admin"]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the tenant's own audit, read through its scope, empty until it holds records", async () => {
    render(await resolveServerComponents(page("test")));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.listTenant).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.getByRole("heading", { name: "Audit — Test" })).toBeTruthy();
    expect(screen.getByText("Nothing has been recorded yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the Global audit" }).getAttribute("href")).toBe("/admin/audit");
    expect(screen.getByRole("link", { name: "Test" }).getAttribute("href")).toBe("/admin/test");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("traces one stock movement: filtered read, its reversal link, and the business date (AUD-004, AUD-030)", async () => {
    const ORIGINAL = "04f49ff9-3cb6-4583-be90-b89287794b08";
    const INVERSE = "264846a6-a50c-4ac8-9945-ee427f810aff";
    const movement = {
      id: "e-1", occurredAt: new Date("2026-10-21T09:48:41Z"), action: "stock.movement.posted",
      subject: { type: "StockMovement", id: ORIGINAL, label: "00000001 — Bolts at 00000001 — Plant" },
      before: { quantity: "500.000000" }, after: { quantity: "525.000000", businessDate: "2026-10-21", reason: "Count" },
      actor: { userId: "u-1", username: "admin" }, sessionId: "c41e08b6-1111-4222-8333-444455556666", channel: "ui", token: null,
    };
    mocks.listTenant.mockResolvedValue({ entries: [movement, { ...movement, id: "e-0", subject: { type: "Material", id: "00000001", label: "Bolts" } }], nextBefore: null });
    mocks.reversalLinks.mockResolvedValue([{ original: ORIGINAL, inverse: INVERSE }]);

    render(await resolveServerComponents(page("test", { subjectType: "StockMovement", subjectId: ORIGINAL })));

    expect(mocks.listTenant).toHaveBeenCalledWith({ limit: 50, subjectType: "StockMovement", subjectId: ORIGINAL });
    expect(mocks.reversalLinks).toHaveBeenCalledWith([ORIGINAL]);
    expect(screen.getByText(/Reversed by/).textContent).toBe("Reversed by 264846a6");
    expect(screen.getByRole("link", { name: "264846a6" }).getAttribute("href")).toBe(`/admin/test/audit?subjectType=StockMovement&subjectId=${INVERSE}`);
    expect(screen.getAllByText("Business date")).toHaveLength(2);
    expect(Array.from((screen.getByLabelText("Record type") as HTMLSelectElement).options).map(({ value }) => value)).toContain("StockMovement");
  });

  it("explains a refused filter in the form instead of a not-found page", async () => {
    render(await resolveServerComponents(page("test", { subjectId: "00000012" })));

    expect(mocks.listTenant).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.reversalLinks).toHaveBeenCalledWith([]);
    expect(screen.getByRole("alert").textContent).toContain("Choose the record type for this ID");
    expect((screen.getByLabelText("Record ID") as HTMLInputElement).value).toBe("00000012");
  });

  it("speaks Polish to a Polish account", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page("test")));

    expect(screen.getByRole("heading", { name: "Audyt — Test" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("link", { name: "Otwórz audyt globalny" })).toBeTruthy();
  });

  it("renders not-found for a tenant missing from the database", async () => {
    mocks.tenantScope.mockRejectedValue((await core()).tenantNotFound());

    await expect(resolveServerComponents(page("test"))).rejects.toThrow("404");
    expect(mocks.listTenant).not.toHaveBeenCalled();
  });

  it("renders not-found for another tenant's entry as the cursor", async () => {
    mocks.listTenant.mockRejectedValue((await core()).auditCursorNotFound());

    await expect(
      resolveServerComponents(page("test", { before: "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f" })),
    ).rejects.toThrow("404");
  });

  it("lets any other failure through", async () => {
    mocks.tenantScope.mockRejectedValue(new Error("disk full"));

    await expect(resolveServerComponents(page("test"))).rejects.toThrow("disk full");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("opens no tenant for a visitor the gate refuses", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(page("test"))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });

  it("is titled under the tenant's title template", () => {
    expect(metadata.title).toBe("Audit");
  });
});
