import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import AdminPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getStatus: vi.fn(),
  requireUser: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({
  requestScope: async () => ({ cradle: { systemStatusService: { getStatus: mocks.getStatus } } }),
}));
vi.mock("../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("./actions", () => ({ signOut: mocks.signOut }));

const status = { databasePath: "/externaldata/cpg.sqlite", appliedMigrations: 3, pendingMigrations: 0, settings: 7 };
const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };

describe("AdminPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue(admin);
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the database status to the signed-in admin", async () => {
    mocks.getStatus.mockResolvedValue(status);

    render(await resolveServerComponents(AdminPage()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireUser).toHaveBeenCalledOnce();
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

  it("links the admin to the users screen", async () => {
    mocks.getStatus.mockResolvedValue(status);

    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByRole("link", { name: "Users" }).getAttribute("href")).toBe("/admin/users");
  });

  it("shows a normal user their name but no database detail", async () => {
    mocks.requireUser.mockResolvedValue(alice);

    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByText("alice").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByText(/arrive with later stories/)).toBeTruthy();
    expect(screen.queryByText("Database")).toBeNull();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: /password/i })).toBeNull();
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });

  it("renders no data when the gate refuses the visitor", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(AdminPage())).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.getStatus).not.toHaveBeenCalled();
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
