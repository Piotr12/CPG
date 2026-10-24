import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import ForecastsPage from "./page";

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
    forecasts: vi.fn(),
    count: vi.fn(),
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
vi.mock("./actions", () => ({ addForecast: vi.fn(), changeForecast: vi.fn(), removeForecast: vi.fn() }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const forecast = (date: string, quantity: string, material = "00000005") => ({ material, location: "00000001", date, quantity, version: 1 });
const scope = (readOnly = false) => ({
  cradle: {
    tenant: { code: "test", name: "Test", generation: 2, readOnly },
    forecastService: { list: mocks.forecasts, count: mocks.count },
    materialService: { list: mocks.materials },
    locationService: { list: mocks.locations },
  },
});
const page = (tenant: string, query: Record<string, string | string[]> = {}) =>
  ForecastsPage({ params: Promise.resolve({ tenant }), searchParams: Promise.resolve(query) });

describe("ForecastsPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.forecasts.mockResolvedValue([forecast("2027-01-01", "10.000000"), forecast("2027-01-02", "20.000000")]);
    mocks.count.mockResolvedValue(2);
    mocks.materials.mockResolvedValue([
      { id: "00000005", type: "finished", description: "Cabinet, red", baseUnit: "each", active: true, createdAt: new Date(), version: 1 },
    ]);
    mocks.locations.mockResolvedValue([{ id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 }]);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the quantity per day, with the admin's controls", async () => {
    render(await resolveServerComponents(page("test")));

    expect(mocks.tenantScope).toHaveBeenCalledWith("test");
    expect(mocks.forecasts).toHaveBeenCalledWith({}, { page: 1, q: "", sort: "material", dir: "asc" });
    expect(screen.getByRole("heading", { name: "Forecasts — Test" })).toBeTruthy();
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").slice(2, 4).map((cell) => cell.textContent))).toEqual([
      ["2027-01-01", "10 each"],
      ["2027-01-02", "20 each"],
    ]);
    expect(screen.getByRole("button", { name: "Add forecast" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions for 00000005 at 00000001 on 2027-01-02" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Clear filter" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Forecast pages" })).toBeNull();
  });

  it("shows the page in the URL with links that keep the filter, counting what the filter matches", async () => {
    mocks.count.mockResolvedValue(250);
    render(await resolveServerComponents(page("test", { material: "00000005", page: "2" })));

    expect(mocks.count).toHaveBeenCalledWith({ material: "00000005" }, { q: "" });
    expect(mocks.forecasts).toHaveBeenCalledWith({ material: "00000005" }, { page: 2, q: "", sort: "material", dir: "asc" });
    const pages = screen.getByRole("navigation", { name: "Forecast pages" });
    expect(pages.textContent).toContain("Page 2 of 3");
    expect(within(pages).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/forecasts?material=00000005");
    expect(within(pages).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/forecasts?material=00000005&page=3");
  });

  it("shows the last page for a page past it, its links keeping a location filter", async () => {
    mocks.count.mockResolvedValue(101);
    render(await resolveServerComponents(page("test", { location: "00000001", page: ["9", "1"] })));

    expect(mocks.count).toHaveBeenCalledWith({ location: "00000001" }, { q: "" });
    expect(mocks.forecasts).toHaveBeenCalledWith({ location: "00000001" }, { page: 2, q: "", sort: "material", dir: "asc" });
    const pages = screen.getByRole("navigation", { name: "Forecast pages" });
    expect(pages.textContent).toContain("Page 2 of 2");
    expect(within(pages).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/admin/test/forecasts?location=00000001");
    expect(within(pages).queryByRole("link", { name: "Next" })).toBeNull();
  });

  it("searches and sorts on the server, every link keeping the filter, the search and the sort (#217)", async () => {
    mocks.count.mockResolvedValue(250);
    const { container } = render(
      await resolveServerComponents(page("test", { material: "00000005", q: " cabinet ", sort: "date", dir: "desc", page: "2" })),
    );

    expect(mocks.count).toHaveBeenCalledWith({ material: "00000005" }, { q: "cabinet" });
    expect(mocks.forecasts).toHaveBeenCalledWith({ material: "00000005" }, { page: 2, q: "cabinet", sort: "date", dir: "desc" });
    expect((screen.getByRole("searchbox", { name: "Search forecasts" }) as HTMLInputElement).value).toBe("cabinet");
    expect(screen.getByText(/250 results for “cabinet”/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/forecasts?material=00000005&sort=date&dir=desc");
    const hidden = (form: Element) => [...form.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map(({ name, value }) => `${name}=${value}`);
    const [searchForm, filterForm] = container.querySelectorAll("form[role=search]");
    expect(hidden(searchForm)).toEqual(["material=00000005", "sort=date", "dir=desc"]);
    expect(hidden(filterForm)).toEqual(["q=cabinet", "sort=date", "dir=desc"]);
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(headers.map((header) => header.getAttribute("aria-sort"))).toEqual(["none", "none", "descending", null, null]);
    expect(within(headers[0]).getByRole("link").getAttribute("href")).toBe("/admin/test/forecasts?material=00000005&q=cabinet&sort=material&dir=asc");
    expect(within(headers[2]).getByRole("link").getAttribute("href")).toBe("/admin/test/forecasts?material=00000005&q=cabinet&sort=date&dir=asc");
    const pages = screen.getByRole("navigation", { name: "Forecast pages" });
    expect(within(pages).getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/admin/test/forecasts?material=00000005&q=cabinet&sort=date&dir=desc&page=3");
  });

  it("says when a search matches nothing, and shows a refused search unfiltered with its reason", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.forecasts.mockResolvedValue([]);
    const { unmount } = render(await resolveServerComponents(page("test", { q: "nothing", location: "00000001" })));
    expect(screen.getByText(/Nothing matches “nothing”\./)).toBeTruthy();
    expect(within(screen.getByRole("table")).getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/forecasts?location=00000001");
    unmount();

    render(await resolveServerComponents(page("test", { q: "a b c d e f" })));
    expect(mocks.forecasts).toHaveBeenLastCalledWith({}, { page: 1, q: "", sort: "material", dir: "asc" });
    expect(screen.getByText(en.lists.searchTooLong)).toBeTruthy();
  });

  it("renders not-found for a page that isn't a positive whole number", async () => {
    for (const bad of ["0", "1.5", "x"]) await expect(resolveServerComponents(page("test", { page: bad }))).rejects.toThrow("404");
    expect(mocks.forecasts).not.toHaveBeenCalled();
  });

  it("shows one page for an empty list", async () => {
    mocks.count.mockResolvedValue(0);
    mocks.forecasts.mockResolvedValue([]);
    render(await resolveServerComponents(page("test", { page: "3" })));
    expect(mocks.forecasts).toHaveBeenCalledWith({}, { page: 1, q: "", sort: "material", dir: "asc" });
    expect(screen.queryByRole("navigation", { name: "Forecast pages" })).toBeNull();
  });

  it("narrows the list by the material and location in the URL, showing them as chosen", async () => {
    render(await resolveServerComponents(page("test", { material: "00000005", location: ["00000001", "00000002"] })));

    expect(mocks.forecasts).toHaveBeenCalledWith({ material: "00000005", location: "00000001" }, { page: 1, q: "", sort: "material", dir: "asc" });
    expect((screen.getByLabelText("Material") as HTMLSelectElement).value).toBe("00000005");
    expect((screen.getByLabelText("Location") as HTMLSelectElement).value).toBe("00000001");
    expect(screen.getByRole("link", { name: "Clear filter" })).toBeTruthy();
  });

  it("ignores a filter that isn't a business ID, and says so when a real filter finds nothing", async () => {
    render(await resolveServerComponents(page("test", { material: "cabinet" })));
    expect(mocks.forecasts).toHaveBeenCalledWith({}, { page: 1, q: "", sort: "material", dir: "asc" });

    mocks.forecasts.mockResolvedValue([]);
    const { unmount } = render(await resolveServerComponents(page("test", { material: "00000005" })));
    expect(screen.getByText("No forecasts match this filter.")).toBeTruthy();
    unmount();
  });

  it("shows a normal user the list without any control (TEN-004), in Polish when chosen", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(page("test")));

    expect(screen.getByRole("heading", { name: "Prognozy — Test" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dodaj prognozę" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Akcje dla/ })).toBeNull();
  });

  it("offers no control in a read-only tenant (R05); an empty list says so, with a hint for a writable one", async () => {
    mocks.forecasts.mockResolvedValue([]);
    mocks.tenantScope.mockResolvedValue(scope(true));
    const { unmount } = render(await resolveServerComponents(page("test")));
    expect(screen.getByText("No forecasts in Test yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add forecast" })).toBeNull();
    unmount();

    mocks.tenantScope.mockResolvedValue(scope());
    render(await resolveServerComponents(page("test")));
    expect(screen.getByText("No forecasts in Test yet. Add the first one with Add forecast.")).toBeTruthy();
  });

  it("renders not-found for an unknown tenant", async () => {
    mocks.tenantScope.mockRejectedValue(new mocks.AppError("TENANT_NOT_FOUND"));
    await expect(resolveServerComponents(page("nope"))).rejects.toThrow("404");
  });
});
