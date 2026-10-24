import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import GlobalAuditPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  listGlobal: vi.fn(),
  usernames: vi.fn(),
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
  requestScope: async () => ({ cradle: { auditService: { listGlobal: mocks.listGlobal }, userService: { usernames: mocks.usernames } } }),
}));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const CURSOR = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";
const entry = {
  id: CURSOR,
  occurredAt: new Date("2026-10-19T10:27:03Z"),
  action: "users.user.created",
  subject: { type: "User", id: "u-2", label: "alice" },
  before: null,
  after: { username: "alice" },
  actor: { userId: "u-1", username: "admin" },
  sessionId: "c41e08b6-1111-4222-8333-444455556666",
  channel: "ui",
  token: null,
};
const page = (searchParams: Record<string, string> = {}) =>
  GlobalAuditPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) } as never);

describe("GlobalAuditPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.listGlobal.mockResolvedValue({ entries: [entry], nextBefore: CURSOR });
    mocks.usernames.mockResolvedValue(["admin", "alice"]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows a normal user the Global audit, newest page first, with a link to older entries (AUD-009)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.listGlobal).toHaveBeenCalledWith({ limit: 50 });
    expect(screen.getByRole("heading", { name: "Global audit" })).toBeTruthy();
    expect(screen.getByText(/Nobody can edit or delete an entry, not even the administrator/)).toBeTruthy();
    expect(screen.getByText("User created")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Older entries →" }).getAttribute("href")).toBe(`/admin/audit?before=${CURSOR}`);
    // The Global audit is in the menu, so it carries no back link.
    expect(screen.queryByRole("link", { name: "Tenants" })).toBeNull();
  });

  it("reads the page the URL asks for", async () => {
    mocks.listGlobal.mockResolvedValue({ entries: [], nextBefore: null });

    render(await resolveServerComponents(page({ before: CURSOR })));

    expect(mocks.listGlobal).toHaveBeenCalledWith({ before: CURSOR, limit: 50 });
    expect(screen.getByRole("link", { name: "← Newest entries" }).getAttribute("href")).toBe("/admin/audit");
  });

  it("filters by the URL's query, offering Global record types and every account, and keeps the filters on paging", async () => {
    render(await resolveServerComponents(page({ subjectType: "User", subjectId: "u-2", channel: "ui" })));

    expect(mocks.listGlobal).toHaveBeenCalledWith({ limit: 50, subjectType: "User", subjectId: "u-2", channel: "ui" });
    expect((screen.getByLabelText("Record type") as HTMLSelectElement).value).toBe("User");
    expect(Array.from((screen.getByLabelText("Record type") as HTMLSelectElement).options).map(({ text }) => text)).toEqual(["All", "User", "API token", "Tenant"]);
    expect(Array.from((screen.getByLabelText("Account") as HTMLSelectElement).options).map(({ text }) => text)).toEqual(["All", "admin", "alice"]);
    expect(screen.getByText("Showing entries that match the filters.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Older entries →" }).getAttribute("href")).toBe(`/admin/audit?subjectType=User&subjectId=u-2&channel=ui&before=${CURSOR}`);
    expect(screen.getByRole("link", { name: "History of alice" }).getAttribute("href")).toBe("/admin/audit?subjectType=User&subjectId=u-2");
  });

  it("renders not-found for a page that doesn't exist", async () => {
    await expect(resolveServerComponents(page({ before: "nope" }))).rejects.toThrow("404");
    expect(mocks.listGlobal).not.toHaveBeenCalled();
  });

  it("speaks Polish to a Polish account", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { name: "Audyt globalny" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("Utworzono użytkownika")).toBeTruthy();
  });

  it("reads nothing for a visitor the gate refuses", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(page())).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.listGlobal).not.toHaveBeenCalled();
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("Global audit · Caveman Planning Good");
  });
});
