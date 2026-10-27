import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, type MrpRunView } from "@cpg/core";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import MrpPage from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), requireUser: vi.fn(), tenantScope: vi.fn(), getMessages: vi.fn(), current: vi.fn(), runMrp: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ runMrp: mocks.runMrp }));

const run: MrpRunView = {
  id: "00000004", createdAt: new Date("2026-10-27T07:12:45.000Z"), account: "anna", channel: "ui", mode: "manual", generation: 3,
  startDate: "2026-10-27", endDate: "2027-01-24", horizonDays: 90, pairs: 30,
};
const scope = (readOnly = false) => ({ cradle: { tenant: { code: "test", name: "Test", generation: 3, readOnly }, mrpRunService: { current: mocks.current } } });
const page = () => MrpPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve({}) });
const field = (key: string) => document.querySelector(`[data-mrp-field="${key}"]`)?.textContent;

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ role: "user" });
  mocks.tenantScope.mockResolvedValue(scope());
  mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  mocks.current.mockResolvedValue(run);
  mocks.runMrp.mockResolvedValue({ ok: true, data: run });
});
afterEach(() => vi.clearAllMocks());

describe("MrpPage", () => {
  it("shows the latest run's ID, time and account, and offers Run MRP bound to the tenant and generation (RUN-002)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { level: 1, name: "MRP — Test" })).toBeTruthy();
    expect(field("id")).toBe("00000004");
    expect(field("time")).toBe("2026-10-27 07:12 UTC");
    expect(field("account")).toBe("anna · UI");
    expect(field("days")).toBe("2026-10-27 – 2027-01-24 (90 days)");
    expect(field("pairs")).toBe("30");
    screen.getByRole("button", { name: en.mrp.run }).click();
    await vi.waitFor(() => expect(mocks.runMrp).toHaveBeenCalledWith("test", 3));
  });

  it("keeps the latest run readable in a read-only tenant, without Run MRP (RUN-021, TEN-019)", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));

    render(await resolveServerComponents(page()));

    expect(field("id")).toBe("00000004");
    expect(screen.queryByRole("button", { name: en.mrp.run })).toBeNull();
  });

  it("says no run exists yet, and how to make one only where one can be made", async () => {
    mocks.current.mockResolvedValue(null);
    render(await resolveServerComponents(page()));
    expect(screen.getByText(en.mrp.empty)).toBeTruthy();
    expect(screen.getByText(en.mrp.emptyWritable)).toBeTruthy();

    mocks.tenantScope.mockResolvedValue(scope(true));
    document.body.innerHTML = "";
    render(await resolveServerComponents(page()));
    expect(screen.getByText(en.mrp.empty)).toBeTruthy();
    expect(screen.queryByText(en.mrp.emptyWritable)).toBeNull();
  });

  it("speaks Polish to a Polish reader, an API run included", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.current.mockResolvedValue({ ...run, account: "bot", channel: "api" });

    render(await resolveServerComponents(page()));

    expect(screen.getByRole("heading", { level: 1, name: "MRP — Test" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("button", { name: pl.mrp.run })).toBeTruthy();
    expect(field("account")).toBe("bot · API");
    expect(field("days")).toBe("2026-10-27 – 2027-01-24 (90 dni)");
    expect(field("time")).toBe("2026-10-27 07:12 UTC");
  });

  it("is the not-found state for an unknown tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new AppError("TENANT_NOT_FOUND", "Unknown tenant.", 404));

    await expect(resolveServerComponents(page())).rejects.toThrow();
    expect(mocks.current).not.toHaveBeenCalled();
  });
});
