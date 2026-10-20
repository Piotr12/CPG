import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import ImportPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  requireAdmin: vi.fn(),
  getMessages: vi.fn(),
  tenantScope: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({ tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../../../components/imports/import-screen", () => ({
  ImportScreen: ({ tenant, labels }: { tenant: { code: string; generation: number; readOnly: boolean }; labels: { template: { download: string } } }) => (
    <p>
      screen for {tenant.code} generation {tenant.generation}, read-only {String(tenant.readOnly)}: {labels.template.download}
    </p>
  ),
}));

const params = Promise.resolve({ tenant: "test" });

describe("ImportPage", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
    mocks.tenantScope.mockResolvedValue({ cradle: { tenant: { code: "test", name: "Test", generation: 3, readOnly: false } } });
  });
  afterEach(() => vi.clearAllMocks());

  it("gives the admin the three steps for the page's tenant and generation", async () => {
    render(await resolveServerComponents(ImportPage({ params } as never)));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { level: 1, name: "Import from spreadsheet — Test" })).toBeTruthy();
    expect(screen.getByText(en.imports.intro)).toBeTruthy();
    expect(screen.getByText("screen for test generation 3, read-only false: Download template (.xlsx)")).toBeTruthy();
    expect(metadata.title).toBe("Import");
  });

  it("speaks Polish to a Polish account", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(ImportPage({ params } as never)));

    expect(screen.getByRole("heading", { level: 1, name: "Import z arkusza kalkulacyjnego — Test" })).toBeTruthy();
  });

  it("lets the admin check refuse a normal user before the tenant is opened", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(resolveServerComponents(ImportPage({ params } as never))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });
});
