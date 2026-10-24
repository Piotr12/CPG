import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import SafetyStockPage from "./page";

const mocks = vi.hoisted(() => {
  class AppError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    AppError,
    connection: vi.fn(),
    getMessages: vi.fn(),
    requireUser: vi.fn(),
    tenantScope: vi.fn(),
    targets: vi.fn(),
    materials: vi.fn(),
    locations: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", async (importOriginal) => ({
  targetStatus: (await importOriginal<typeof import("@cpg/core")>()).targetStatus,
  AppError: mocks.AppError,
  tenantScope: mocks.tenantScope,
}));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ addSafetyStockTarget: vi.fn(), changeSafetyStockTarget: vi.fn(), removeSafetyStockTarget: vi.fn() }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const target = (effectiveFrom: string, quantity: string) => ({ material: "00000005", location: "00000001", effectiveFrom, quantity, version: 1 });
const scope = (readOnly = false) => ({
  cradle: {
    tenant: { code: "test", name: "Test", generation: 2, readOnly },
    safetyStockTargetService: { list: mocks.targets },
    materialService: { list: mocks.materials },
    locationService: { list: mocks.locations },
  },
});
const page = (tenant: string, searchParams: Record<string, string> = {}) =>
  SafetyStockPage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve(searchParams) });

describe("SafetyStockPage", () => {
  beforeEach(() => {
    // "Today" is the server's UTC date (spec Q10).
    vi.useFakeTimers({ now: new Date("2027-01-20T23:30:00Z"), toFake: ["Date"] });
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.targets.mockResolvedValue([target("2026-06-01", "10.000000"), target("2027-01-01", "20.000000"), target("2027-02-01", "40.000000")]);
    mocks.materials.mockResolvedValue([
      { id: "00000005", type: "finished", description: "Cabinet, red", baseUnit: "each", active: true, createdAt: new Date(), version: 1 },
    ]);
    mocks.locations.mockResolvedValue([{ id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 }]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("labels each target with where it stands today: superseded, in effect, scheduled (DEM-015, DEM-016)", async () => {
    render(await resolveServerComponents(page("test")));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(screen.getByRole("heading", { name: "Safety stock — Test" })).toBeTruthy();
    expect(screen.getByText(/Status is as of today, 2027-01-20 \(UTC\)\./)).toBeTruthy();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").slice(2, 5).map((cell) => cell.textContent))).toEqual([
      ["2026-06-01", "10 each", "Superseded"],
      ["2027-01-01", "20 each", "In effect"],
      ["2027-02-01", "40 each", "Scheduled"],
    ]);
    expect(screen.getByRole("button", { name: "Add target" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for 00000005 at 00000001 from 2027-02-01" })).toBeTruthy();
  });

  it("shows a normal user the list without any control (TEN-004), in Polish when chosen", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page("test")));

    expect(screen.getByRole("heading", { name: "Zapas bezpieczeństwa — Test" })).toBeTruthy();
    expect(screen.getByText("Obowiązuje")).toBeTruthy();
    expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual(["Szukaj"]);
  });

  it("offers no control in a read-only tenant (R05); an empty list says so, with a hint for a writable one", async () => {
    mocks.targets.mockResolvedValue([]);
    mocks.tenantScope.mockResolvedValue(scope(true));
    const { unmount } = render(await resolveServerComponents(page("test")));
    expect(screen.getByText("No safety-stock targets in Test yet.")).toBeTruthy();
    expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual(["Search"]);
    unmount();

    mocks.tenantScope.mockResolvedValue(scope());
    render(await resolveServerComponents(page("test")));
    expect(screen.getByText("No safety-stock targets in Test yet. Add the first one with Add target.")).toBeTruthy();
  });

  it("lists by material when the address asks for nothing, and searches and sorts on the server as of today (#217)", async () => {
    render(await resolveServerComponents(page("test")));
    expect(mocks.targets).toHaveBeenLastCalledWith({ q: "", sort: "material", dir: "asc", today: "2027-01-20" });
    expect(screen.getByRole("columnheader", { name: "Material" }).getAttribute("aria-sort")).toBe("ascending");

    render(await resolveServerComponents(page("test", { q: "cabinet", sort: "status", dir: "desc" })));
    expect(mocks.targets).toHaveBeenLastCalledWith({ q: "cabinet", sort: "status", dir: "desc", today: "2027-01-20" });
    expect(screen.getByRole("status").textContent).toBe("3 results for “cabinet” · Clear search");
  });

  it("refuses a search past the limits in the form, listing everything, and ignores an unknown sort (#217)", async () => {
    render(await resolveServerComponents(page("test", { q: "x".repeat(101), sort: "quantity" })));

    expect(mocks.targets).toHaveBeenCalledWith({ q: "", sort: "material", dir: "asc", today: "2027-01-20" });
    expect(screen.getByRole("searchbox").getAttribute("aria-invalid")).toBe("true");
  });

  it("renders not-found for an unknown tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page("nope"))).rejects.toThrow("404");
  });
});
