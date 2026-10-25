import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, ValidationError } from "@cpg/core";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { demandView } from "../../../../../components/reports/demand-review-fixture";
import { en } from "../../../../../i18n/messages/en";
import { pl } from "../../../../../i18n/messages/pl";
import DemandReviewPage from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), requireUser: vi.fn(), tenantScope: vi.fn(), getMessages: vi.fn(), read: vi.fn(), factors: vi.fn(), locations: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", async (original) => ({ ...(await original<typeof import("@cpg/core")>()), tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const widget = { id: "00000001", description: "Widget", active: true, baseUnit: "each", perBaseUnit: "1.5", otherUnits: [] };
const gadget = { ...widget, id: "00000002", description: "Gadget", perBaseUnit: null };
const plant = { id: "00000001", name: "Plant", active: true, createdAt: new Date(), version: 1 };
const scope = (readOnly = false) => ({
  cradle: { tenant: { ...tenant, readOnly }, demandReviewService: { read: mocks.read }, materialService: { statisticalFactors: mocks.factors }, locationService: { list: mocks.locations } },
});
const page = (search: Record<string, string | string[]> = {}) => DemandReviewPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(search) });

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ role: "user" });
  mocks.tenantScope.mockResolvedValue(scope());
  mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  mocks.factors.mockResolvedValue([widget, gadget]);
  mocks.locations.mockResolvedValue([plant]);
  mocks.read.mockResolvedValue(demandView());
});
afterEach(() => vi.clearAllMocks());

describe("DemandReviewPage", () => {
  it("reads the review through the tenant's scope with the address's filters, for any signed-in account", async () => {
    render(await resolveServerComponents(page({ bucket: "month", material: ["00000001", "00000002"], unit: "SU" })));
    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalled();
    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.read).toHaveBeenCalledWith({ bucket: "month", material: ["00000001", "00000002"], unit: "SU" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Demand review — Test");
    expect(screen.getByRole("table", { name: "Shipped and still to ship per product and week" })).toBeTruthy();
  });

  it("shows a read-only tenant the same review, in the reader's language", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    render(await resolveServerComponents(page()));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Przegląd popytu — Test");
  });

  it("is not found for a malformed address or a record the tenant doesn't have", async () => {
    await expect(resolveServerComponents(page({ offset: "99" }))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockRejectedValue(new AppError("LOCATION_NOT_FOUND", "missing", 404));
    await expect(resolveServerComponents(page({ location: "00000009" }))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("explains a product that isn't finished and shows the review without the product filter", async () => {
    mocks.read.mockRejectedValueOnce(new ValidationError({ material: ["Choose finished products only."] }, { material: "00000003" }));
    render(await resolveServerComponents(page({ material: "00000003", bucket: "day" })));
    expect(mocks.read).toHaveBeenLastCalledWith({ material: [], bucket: "day" });
    expect(screen.getByText(en.demandReview.finishedOnly)).toBeTruthy();
  });

  it("lets any other failure through", async () => {
    mocks.read.mockRejectedValue(new Error("disk"));
    await expect(resolveServerComponents(page())).rejects.toThrow("disk");
  });
});
