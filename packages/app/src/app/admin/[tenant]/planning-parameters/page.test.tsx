import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import PlanningParametersPage from "./page";

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
    sets: vi.fn(),
    materials: vi.fn(),
    locations: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("./actions", () => ({ addPlanningParameters: vi.fn(), changePlanningParameters: vi.fn(), removePlanningParameters: vi.fn() }));

beforeAll(() => {
  // Radix positions menus with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const material = (id: string, description: string, baseUnit: string, active = true) => ({
  id,
  type: "intermediate",
  description,
  baseUnit,
  active,
  createdAt: new Date(),
  version: 1,
});
const location = (id: string, name: string, active = true) => ({ id, name, active, createdAt: new Date(), version: 1 });
const set = (materialId: string, locationId: string, procurement: "make" | "buy") => ({
  material: materialId,
  location: locationId,
  procurement,
  leadTimeDays: 2,
  minimumQuantity: "50.000000",
  lotMultiple: "0.500000",
  version: 1,
});
const scope = (readOnly = false) => ({
  cradle: {
    tenant: { code: "prod", name: "Prod", generation: 1, readOnly },
    planningParameterService: { list: mocks.sets },
    materialService: { list: mocks.materials },
    locationService: { list: mocks.locations },
  },
});
const page = (tenant: string, searchParams: Record<string, string> = {}) =>
  PlanningParametersPage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve(searchParams) });

describe("PlanningParametersPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.sets.mockResolvedValue([set("00000004", "00000001", "make"), set("00000004", "00000003", "buy")]);
    mocks.materials.mockResolvedValue([material("00000004", "Painted side panel", "each"), material("00000009", "Old part", "kg", false)]);
    mocks.locations.mockResolvedValue([location("00000001", "Main plant"), location("00000003", "Contract packer", false)]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the tenant's sets with their materials and locations, quantities in the base unit (MAT-015, MAT-016)", async () => {
    render(await resolveServerComponents(page("prod")));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(screen.getByRole("heading", { name: "Planning parameters — Prod" })).toBeTruthy();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").slice(0, 6).map((cell) => cell.textContent))).toEqual([
      ["00000004Painted side panel", "00000001Main plant", "Make", "2", "50 each", "0.5 each"],
      ["00000004Painted side panel", "00000003Contract packerInactive", "Buy", "2", "50 each", "0.5 each"],
    ]);
    expect(screen.getAllByRole("link", { name: "00000004" })[0].getAttribute("href")).toBe("/admin/prod/materials/00000004");
    expect(screen.getByRole("button", { name: "Add parameters" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for 00000004 at 00000003" })).toBeTruthy();
  });

  it("shows a normal user the list without any control (TEN-004), in Polish when chosen", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page("prod")));

    expect(screen.getByRole("heading", { name: "Parametry planowania — Prod" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getAllByText("Produkcja")).toHaveLength(1);
    expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual(["Szukaj"]);
  });

  it("offers the admin no control while the tenant is read-only (R05), and an empty list says so", async () => {
    mocks.tenantScope.mockResolvedValue(scope(true));
    mocks.sets.mockResolvedValue([]);

    render(await resolveServerComponents(page("prod")));

    expect(screen.getByText("No planning parameters in Prod yet.")).toBeTruthy();
    expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual(["Search"]);
  });

  it("tells the admin how to start in an empty, writable tenant", async () => {
    mocks.sets.mockResolvedValue([]);

    render(await resolveServerComponents(page("prod")));

    expect(screen.getByText("No planning parameters in Prod yet. Add the first set with Add parameters.")).toBeTruthy();
  });

  it("lists by material when the address asks for nothing, and searches and sorts on the server as it says (#217)", async () => {
    render(await resolveServerComponents(page("prod")));
    expect(mocks.sets).toHaveBeenLastCalledWith({ q: "", sort: "material", dir: "asc" });
    expect(screen.getByRole("columnheader", { name: "Material" }).getAttribute("aria-sort")).toBe("ascending");

    render(await resolveServerComponents(page("prod", { q: "panel", sort: "location", dir: "desc" })));
    expect(mocks.sets).toHaveBeenLastCalledWith({ q: "panel", sort: "location", dir: "desc" });
    expect(screen.getByRole("status").textContent).toBe("2 results for “panel” · Clear search");
  });

  it("refuses a search past the limits in the form, listing everything, and ignores an unknown sort (#217)", async () => {
    render(await resolveServerComponents(page("prod", { q: "a b c d e f", sort: "version" })));

    expect(mocks.sets).toHaveBeenCalledWith({ q: "", sort: "material", dir: "asc" });
    expect(screen.getByRole("searchbox").getAttribute("aria-invalid")).toBe("true");
  });

  it("reads nothing for a visitor the gate refuses, and renders not-found for an unknown tenant", async () => {
    mocks.requireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT /login"));
    await expect(resolveServerComponents(page("prod"))).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.tenantScope).not.toHaveBeenCalled();

    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page("nope"))).rejects.toThrow("404");
  });
});
