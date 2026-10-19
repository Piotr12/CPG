import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../tests/setup/server-components";
import AdminPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getStatus: vi.fn(),
  listTenants: vi.fn(),
  requireAdmin: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({
  requestScope: async () => ({
    cradle: { systemStatusService: { getStatus: mocks.getStatus }, tenantService: { list: mocks.listTenants } },
  }),
}));
vi.mock("../../../auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../actions", () => ({ signOut: mocks.signOut }));

const status = { databasePath: "/externaldata/cpg.sqlite", appliedMigrations: 3, pendingMigrations: 0, settings: 7 };
const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };

describe("AdminPage", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.listTenants.mockResolvedValue([
      { code: "test", name: "Test", generation: 1 },
      { code: "prod", name: "Prod", generation: 1 },
    ]);
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the database status to the signed-in admin", async () => {
    mocks.getStatus.mockResolvedValue(status);

    render(await resolveServerComponents(AdminPage()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Cave control" })).toBeTruthy();
    expect(screen.getByText("/externaldata/cpg.sqlite")).toBeTruthy();
    expect(screen.getByText("3 migrations applied")).toBeTruthy();
    expect(screen.getByText("7 settings")).toBeTruthy();
    expect(screen.getByText("0 pending").dataset.variant).toBe("outline");
  });

  it("names the signed-in user and offers to sign out", async () => {
    mocks.getStatus.mockResolvedValue(status);

    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByText("admin").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("renders no data when the gate refuses the visitor", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(AdminPage())).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });

  it("offers both tenants to choose from (TEN-001, TEN-010)", async () => {
    mocks.getStatus.mockResolvedValue(status);

    render(await resolveServerComponents(AdminPage()));

    const chooser = screen.getByRole("navigation", { name: "Choose a tenant" });
    expect(
      [...chooser.querySelectorAll("a")].map((link) => [link.getAttribute("href"), link.textContent]),
    ).toEqual([
      ["/admin/test", "TestDemonstration data, safe to experimentOpen Test →"],
      ["/admin/prod", "ProdLive dataOpen Prod →"],
    ]);
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
