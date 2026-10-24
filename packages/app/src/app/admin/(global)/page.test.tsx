import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../tests/setup/server-components";
import { en } from "../../../i18n/messages/en";
import { pl } from "../../../i18n/messages/pl";
import AdminPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getStatus: vi.fn(),
  listTenants: vi.fn(),
  requireUser: vi.fn(),
  getMessages: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({
  requestScope: async () => ({
    cradle: { systemStatusService: { getStatus: mocks.getStatus }, tenantService: { list: mocks.listTenants } },
  }),
}));
vi.mock("../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ setTenantReadOnly: vi.fn(), resetTest: vi.fn() }));

const status = { databasePath: "/externaldata/cpg.sqlite", appliedMigrations: 3, pendingMigrations: 0, settings: 7 };
const tenants = [
  { code: "test", name: "Test", generation: 1, readOnly: false },
  { code: "prod", name: "Prod", generation: 1, readOnly: false },
];
/** The chooser's links as [href, text]. */
const choices = (label: string) =>
  [...screen.getByRole("navigation", { name: label }).querySelectorAll("a")].map((link) => [
    link.getAttribute("href"),
    link.textContent,
  ]);
const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };

function as(locale: "en" | "pl") {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
}

describe("AdminPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(admin);
    mocks.getStatus.mockResolvedValue(status);
    mocks.listTenants.mockResolvedValue(tenants);
    as("en");
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the database status to the signed-in admin", async () => {
    render(await resolveServerComponents(AdminPage()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Tenants" })).toBeTruthy();
    expect(screen.getByText("/externaldata/cpg.sqlite")).toBeTruthy();
    expect(screen.getByText("3 migrations applied")).toBeTruthy();
    expect(screen.getByText("7 settings")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset Test…" })).toBeTruthy();
    expect(screen.getByText("Generation 1")).toBeTruthy();
    expect(screen.getByText("0 pending").dataset.variant).toBe("outline");
  });

  it("leaves the account, its switches and the links to other screens to the menu", async () => {
    render(await resolveServerComponents(AdminPage()));

    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Language" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "API tokens" })).toBeNull();
  });

  it("speaks Polish to a Polish account (UX-002)", async () => {
    as("pl");

    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByRole("heading", { name: "Środowiska" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("Zastosowane migracje: 3")).toBeTruthy();
  });

  it("gives a normal user the tenant chooser, but no database detail (TEN-010)", async () => {
    mocks.requireUser.mockResolvedValue(alice);

    render(await resolveServerComponents(AdminPage()));

    expect(choices("Choose a tenant").map(([href]) => href)).toEqual(["/admin/test", "/admin/prod"]);
    expect(screen.queryByText("Database")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset Test…" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Read-only" })).toBeNull();
    expect(screen.queryByRole("button", { name: /read-only|writable/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /password/i })).toBeNull();
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });

  it("offers both tenants to choose from (TEN-001, TEN-010)", async () => {
    render(await resolveServerComponents(AdminPage()));

    expect(choices("Choose a tenant")).toEqual([
      ["/admin/test", "TestDemonstration data, safe to experimentOpen Test →"],
      ["/admin/prod", "ProdLive dataOpen Prod →"],
    ]);
  });

  it("marks a read-only tenant on the chooser, for every account (R05)", async () => {
    mocks.requireUser.mockResolvedValue(alice);
    mocks.listTenants.mockResolvedValue([tenants[0], { ...tenants[1], readOnly: true }]);

    render(await resolveServerComponents(AdminPage()));

    expect(choices("Choose a tenant")).toEqual([
      ["/admin/test", "TestDemonstration data, safe to experimentOpen Test →"],
      ["/admin/prod", "ProdLive dataRead-onlyOpen Prod →"],
    ]);
  });

  it("gives the admin a read-only switch per tenant, showing each one's state", async () => {
    mocks.listTenants.mockResolvedValue([tenants[0], { ...tenants[1], readOnly: true }]);

    render(await resolveServerComponents(AdminPage()));

    const rows = within(screen.getByRole("list", { name: "Read-only" })).getAllByRole("listitem");
    expect(rows.map((row) => [row.dataset.tenant, row.textContent])).toEqual([
      ["test", "TestWritableMake Test read-only"],
      ["prod", "ProdRead-onlyMake Prod writable"],
    ]);
    expect(screen.getByText(/nobody can change its business data, the administrator and the API included/)).toBeTruthy();
  });

  it("offers the tenants in Polish to a Polish account", async () => {
    as("pl");

    render(await resolveServerComponents(AdminPage()));

    expect(choices("Wybierz środowisko")).toEqual([
      ["/admin/test", "TestDane demonstracyjne, można bezpiecznie eksperymentowaćOtwórz Test →"],
      ["/admin/prod", "ProdDane rzeczywisteOtwórz Prod →"],
    ]);
  });

  it("renders no data when the gate refuses the visitor", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(AdminPage())).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(mocks.listTenants).not.toHaveBeenCalled();
  });

  it("flags pending migrations", async () => {
    mocks.getStatus.mockResolvedValue({ ...status, pendingMigrations: 2 });

    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByText("2 pending").dataset.variant).toBe("destructive");
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("Admin · Caveman Planning Good");
  });
});
