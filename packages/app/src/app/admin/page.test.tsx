import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import AdminPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getStatus: vi.fn(),
  requireAdmin: vi.fn(),
  getMessages: vi.fn(),
  currentPreferences: vi.fn(),
  signOut: vi.fn(),
  updatePreferences: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({
  requestScope: async () => ({ cradle: { systemStatusService: { getStatus: mocks.getStatus } } }),
}));
vi.mock("../../auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../preferences/current-preferences", () => ({ currentPreferences: mocks.currentPreferences }));
vi.mock("./actions", () => ({ signOut: mocks.signOut, updatePreferences: mocks.updatePreferences }));

const status = { databasePath: "/externaldata/cpg.sqlite", appliedMigrations: 3, pendingMigrations: 0, settings: 7 };
const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };

function as(locale: "en" | "pl", theme: "light" | "dark" = "light") {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
  mocks.currentPreferences.mockResolvedValue({ locale, theme });
}

describe("AdminPage", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue(admin);
    mocks.getStatus.mockResolvedValue(status);
    as("en");
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the database status to the signed-in admin", async () => {
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
    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByText("admin").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")?.dataset.action).toBe("sign-out");
  });

  it("offers the language and theme switches with the current choices pressed", async () => {
    as("en", "dark");

    render(await resolveServerComponents(AdminPage()));

    const language = screen.getByRole("group", { name: "Language" });
    expect(within(language).getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("true");
    const theme = screen.getByRole("group", { name: "Theme" });
    expect(within(theme).getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("speaks Polish to a Polish account (UX-002)", async () => {
    as("pl");

    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByRole("heading", { name: "Kontrola jaskini" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("Zastosowane migracje: 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wyloguj" })).toBeTruthy();
  });

  it("renders no data when the gate refuses the visitor", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

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
