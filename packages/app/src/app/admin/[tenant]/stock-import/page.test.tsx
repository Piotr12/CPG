import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import StockImportPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  requireUser: vi.fn(),
  getMessages: vi.fn(),
  tenantScope: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({ tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../../../components/imports/import-screen", () => ({
  ImportScreen: ({ tenant, labels, kind }: { tenant: { code: string; generation: number; readOnly: boolean }; labels: { template: { download: string }; reason?: { label: string } }; kind: string }) => (
    <p>
      {kind} screen for {tenant.code} generation {tenant.generation}, read-only {String(tenant.readOnly)}: {labels.template.download}, {labels.reason?.label}
    </p>
  ),
}));

const params = Promise.resolve({ tenant: "test" });

describe("StockImportPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
    mocks.tenantScope.mockResolvedValue({ cradle: { tenant: { code: "test", name: "Test", generation: 3, readOnly: true } } });
  });
  afterEach(() => vi.clearAllMocks());

  it("gives any signed-in account the stock import's three steps for the page's tenant and generation", async () => {
    render(await resolveServerComponents(StockImportPage({ params } as never)));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { level: 1, name: "Stock import — Test" })).toBeTruthy();
    expect(screen.getByText(en.stockImport.intro)).toBeTruthy();
    expect(screen.getByText("stock screen for test generation 3, read-only true: Download template (.xlsx), Reason")).toBeTruthy();
    expect(metadata.title).toBe("Stock import");
  });

  it("speaks Polish to a Polish account", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(StockImportPage({ params } as never)));

    expect(screen.getByRole("heading", { level: 1, name: "Import stanów — Test" })).toBeTruthy();
  });

  it("lets the sign-in check refuse a visitor before the tenant is opened", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(resolveServerComponents(StockImportPage({ params } as never))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.tenantScope).not.toHaveBeenCalled();
  });
});
