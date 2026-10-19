import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { ReadOnlyBanner } from "./read-only-banner";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn(), currentUser: vi.fn(), getTenant: vi.fn() }));
vi.mock("@cpg/core", () => ({
  TENANT_NAMES: { test: "Test", prod: "Prod" },
  requestScope: async () => ({ cradle: { tenantService: { get: mocks.getTenant } } }),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../auth/require-admin", () => ({ currentUser: mocks.currentUser, HOME_PATH: "/admin" }));

function as(locale: "en" | "pl", role: "admin" | "user", readOnly: boolean) {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
  mocks.currentUser.mockResolvedValue({ userId: "u1", username: "alice", role });
  mocks.getTenant.mockImplementation(async (code: string) => ({ code, readOnly }));
}

describe("ReadOnlyBanner", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows nothing for a writable tenant", async () => {
    as("en", "admin", false);

    const { container } = render(await ReadOnlyBanner({ tenant: "test" }));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.getTenant).toHaveBeenCalledWith("test");
    expect(container.innerHTML).toBe("");
  });

  it("tells a normal user the tenant is read-only and what still works, without the admin's link", async () => {
    as("en", "user", true);

    render(await ReadOnlyBanner({ tenant: "prod" }));

    const banner = screen.getByRole("status");
    expect(banner.dataset.readOnlyBanner).toBe("prod");
    expect(banner.className).toContain("bg-neutral-900");
    expect(banner.textContent).toBe(
      "Prod is read-only — business changes are blocked. Reading, the audit, preferences and user management still work.",
    );
    expect(screen.getByText("Prod is read-only").tagName).toBe("STRONG");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers the admin a link to Tenants, in the admin's language", async () => {
    as("pl", "admin", true);

    render(await ReadOnlyBanner({ tenant: "test" }));

    const banner = screen.getByRole("status");
    expect(banner.getAttribute("lang")).toBe("pl");
    expect(banner.className).toContain("bg-amber-100");
    expect(screen.getByText("Test jest tylko do odczytu")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zmień w Środowiskach" }).getAttribute("href")).toBe("/admin");
  });

  it("offers no link when the session check fails closed", async () => {
    as("en", "admin", true);
    mocks.currentUser.mockResolvedValue(null);

    render(await ReadOnlyBanner({ tenant: "prod" }));

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
