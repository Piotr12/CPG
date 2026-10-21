import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import { completionMaterials, completionView, production, tenant, materials, locations } from "../../../../../tests/setup/production-orders";
import ProductionOrdersPage from "../../app/admin/[tenant]/production-orders/page";
import ProductionOrderPage from "../../app/admin/[tenant]/production-orders/[id]/page";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { ProductionScreen } from "./production-screen";
const mocks = vi.hoisted(() => {
  class AppError extends Error { constructor(readonly code: string) { super(code); } }
  return { AppError, connection: vi.fn(), requireUser: vi.fn(), getMessages: vi.fn(), tenantScope: vi.fn(), list: vi.fn(), count: vi.fn(), get: vi.fn(), materials: vi.fn(), units: vi.fn(), completions: vi.fn(), locations: vi.fn(), notFound: vi.fn(() => { throw new Error("404"); }) };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../app/admin/[tenant]/production-orders/actions", () => ({ cancelProductionOrder: vi.fn(), closeEarlyProductionOrder: vi.fn(), createProductionOrder: vi.fn(), updateProductionOrder: vi.fn(), postProductionCompletion: vi.fn() }));
const scope = () => ({ cradle: { tenant, productionOrderService: { list: mocks.list, count: mocks.count, get: mocks.get }, productionCompletionService: { list: mocks.completions },
  materialService: { list: mocks.materials, listUnits: mocks.units }, locationService: { list: mocks.locations } } });
const page = (value?: string) => ProductionOrdersPage({ params: Promise.resolve({ tenant: "test" }), searchParams: Promise.resolve(value === undefined ? {} : { page: value }) });
const detail = (completions?: string) => ProductionOrderPage({ params: Promise.resolve({ tenant: "test", id: production.id }), searchParams: Promise.resolve(completions === undefined ? {} : { completions }) });
beforeEach(() => {
  mocks.tenantScope.mockResolvedValue(scope()); mocks.getMessages.mockResolvedValue({ locale: "en", messages: en }); mocks.list.mockResolvedValue([production]);
  mocks.count.mockResolvedValue(1); mocks.get.mockResolvedValue(production); mocks.materials.mockResolvedValue(materials); mocks.locations.mockResolvedValue(locations);
  mocks.completions.mockResolvedValue([]); mocks.units.mockResolvedValue({ "00000005": ["each", "case"] });
});
afterEach(() => vi.clearAllMocks());
it("gives both request-time routes a visible shared loading shell", () => {
  for (const route of [page(), detail()]) {
    const { container, unmount } = render(route.props.children.props.fallback);
    expect(container.querySelector('[aria-busy="true"] [data-slot="skeleton"]')).toBeTruthy();
    unmount();
  }
});
it("lists targets with recipe links behind request-time authentication", async () => {
  render(await resolveServerComponents(page()));
  expect(mocks.connection).toHaveBeenCalledOnce(); expect(mocks.requireUser).toHaveBeenCalledOnce(); expect(mocks.tenantScope).toHaveBeenCalledWith("test");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Test · Production orders");
  expect(screen.getByRole("link", { name: "00000001" }).getAttribute("href")).toBe("/admin/test/production-orders/00000001");
  expect(within(screen.getByRole("table", { name: en.productionOrders.title })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
    "00000001", "00000005 Cabinet", "24 each", "00000001 Warehouse", "2027-01-04", "2026-12-30", "00000002 / 3", "Open",
  ]);
});
it("shows pinned revision, stored conversion and current shortage detail", async () => {
  render(await resolveServerComponents(detail()));
  expect(mocks.get).toHaveBeenCalledWith(production.id); expect(mocks.list).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Production order 00000001");
  expect(screen.getByRole("link", { name: "00000002 / 3" }).getAttribute("href")).toBe("/admin/test/boms/00000002?revision=3");
  expect(screen.getByText("2 case (1 case = 12 each)")).toBeTruthy(); expect(screen.getByRole("status").textContent).toBe(en.productionOrders.warning);
  expect(screen.getByText("18 kg")).toBeTruthy();
  expect(screen.getByText(en.productionOrders.leadTime).nextElementSibling?.textContent).toBe("5 calendar days");
  expect(screen.getByText(en.productionOrders.produced).nextElementSibling?.textContent).toBe("0 each");
  expect(screen.getByText(en.productionOrders.outstanding).nextElementSibling?.textContent).toBe("24 each");
  expect(mocks.completions).toHaveBeenCalledWith(production.id, 1);
  expect(screen.getByText(en.productionOrders.completion.historyEmpty)).toBeTruthy();
  expect(screen.getByRole("button", { name: en.productionOrders.completion.post })).toBeTruthy();
});
it("pages the completion history, rejects a malformed history page, and offers posting on an Open order", async () => {
  mocks.materials.mockResolvedValue(completionMaterials); mocks.completions.mockResolvedValue([completionView]);
  render(await resolveServerComponents(detail("2")));
  expect(mocks.completions).toHaveBeenCalledWith(production.id, 2);
  expect(screen.getByText(/00000006 Cocoa — expected 20, actual 18 kg, variance -2/)).toBeTruthy();
  expect(screen.getByRole("link", { name: en.productionOrders.completion.previous }).getAttribute("href")).toBe("/admin/test/production-orders/00000001?completions=1");
  await expect(resolveServerComponents(detail("0"))).rejects.toThrow("404");
  await expect(resolveServerComponents(detail("x"))).rejects.toThrow("404");
  cleanup();
  const props = { tenant, orders: [], total: 0, page: 1, materials: completionMaterials, locations, messages: en, locale: "en" as const };
  render(<ProductionScreen {...props} order={production} completions={[completionView]} />);
  expect(screen.getByRole("button", { name: en.productionOrders.completion.post })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reverse completion 00000002" })).toBeTruthy();
  cleanup();
  render(<ProductionScreen {...props} tenant={{ ...tenant, readOnly: true }} order={production} completions={[completionView]} />);
  expect(screen.queryByRole("button", { name: /^Reverse completion/ })).toBeNull();
  expect(screen.getByRole("columnheader", { name: en.productionOrders.output })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: en.productionOrders.completion.actions })).toBeNull();
});
it("bounds pages, clamps stale pages and rejects invalid parameters", async () => {
  mocks.count.mockResolvedValue(201); render(await resolveServerComponents(page("1")));
  expect(screen.queryByRole("link", { name: en.productionOrders.previous })).toBeNull(); expect(screen.getByRole("link", { name: en.productionOrders.next }).getAttribute("href")).toContain("?page=2");
  cleanup(); render(await resolveServerComponents(page("2"))); expect(screen.getByRole("link", { name: en.productionOrders.previous }).getAttribute("href")).toContain("?page=1");
  cleanup(); render(await resolveServerComponents(page("999"))); expect(mocks.list).toHaveBeenLastCalledWith(3); expect(screen.queryByRole("link", { name: en.productionOrders.next })).toBeNull();
  await expect(resolveServerComponents(page("0"))).rejects.toThrow("404");
});
it("translates empty/read-only states and keeps terminal orders readable without edit controls", async () => {
  const props = { tenant: { ...tenant, readOnly: true }, orders: [], total: 0, page: 1, materials, locations, messages: pl, locale: "pl" as const };
  render(<ProductionScreen {...props} />); expect(screen.getByText(pl.productionOrders.empty)).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
  cleanup(); render(<ProductionScreen {...props} tenant={tenant} order={{ ...production, status: "completed", shortages: [] }} />);
  expect(screen.getByRole("status").textContent).toBe(pl.productionOrders.sufficient); expect(screen.queryByRole("button")).toBeNull();
});
it("returns not-found for missing tenants or orders and propagates other failures", async () => {
  mocks.tenantScope.mockRejectedValueOnce(new mocks.AppError("TENANT_NOT_FOUND"));
  await expect(resolveServerComponents(page())).rejects.toThrow("404");
  mocks.get.mockRejectedValueOnce(new mocks.AppError("PRODUCTION_ORDER_NOT_FOUND"));
  await expect(resolveServerComponents(detail())).rejects.toThrow("404");
  mocks.get.mockRejectedValueOnce(new Error("broken")); await expect(resolveServerComponents(detail())).rejects.toThrow("broken");
});
