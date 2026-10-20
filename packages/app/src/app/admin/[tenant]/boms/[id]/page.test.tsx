import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../../tests/setup/server-components";
import { en } from "../../../../../i18n/messages/en";
import BomPage from "./page";

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
    get: vi.fn(),
    getRevision: vi.fn(),
    materials: vi.fn(),
    units: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    }),
  };
});
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@cpg/core", () => ({ AppError: mocks.AppError, tenantScope: mocks.tenantScope }));
vi.mock("../../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../../../../components/boms/bom-controls", () => ({
  BomControls: ({ bom, choices }: { bom: { id: string; version: number }; choices: { value: string }[] }) => (
    <button>{`controls ${bom.id} v${bom.version} ${choices.map(({ value }) => value).join(",")}`}</button>
  ),
}));

const material = (id: string, type: string, description: string, baseUnit: string, active = true) => ({
  id,
  type,
  description,
  baseUnit,
  active,
  createdAt: new Date(),
  version: 1,
});
const MATERIALS = [
  material("00000002", "raw", "Bolt M8", "each", false),
  material("00000004", "intermediate", "Painted side panel", "each"),
  material("00000005", "finished", "Cabinet, red", "each"),
];
const bolts = { material: "00000002", quantity: "24.000000", enteredQuantity: "2", enteredUnit: "case", numerator: "12", denominator: "1" };
const panels = { material: "00000004", quantity: "4.000000", enteredQuantity: "4", enteredUnit: "each", numerator: "1", denominator: "1" };
const revision = (number: number, validThrough: string | null) => ({
  number,
  priority: 2,
  validFrom: "2026-01-01",
  validThrough,
  createdAt: new Date(`2026-10-20T0${number}:15:00Z`),
});
const BOM = {
  id: "00000003",
  output: "00000005",
  active: true,
  revision: 2,
  priority: 2,
  validFrom: "2026-01-01",
  validThrough: "2026-12-31",
  components: [panels, bolts],
  createdAt: new Date("2026-10-20T01:15:00Z"),
  version: 3,
  revisions: [revision(2, "2026-12-31"), revision(1, null)],
};
const page = (revisionParam?: string | string[]) =>
  BomPage({
    params: Promise.resolve({ tenant: "prod", id: "00000003" }),
    searchParams: Promise.resolve(revisionParam === undefined ? {} : { revision: revisionParam }),
  });
const scope = (readOnly = false) => ({
  cradle: {
    tenant: { code: "prod", name: "Prod", generation: 1, readOnly },
    bomService: { get: mocks.get, getRevision: mocks.getRevision },
    materialService: { list: mocks.materials, listUnits: mocks.units },
  },
});
const cells = (name: string) =>
  within(screen.getByRole("table", { name }))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));

describe("BomPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue(scope());
    mocks.get.mockResolvedValue(BOM);
    mocks.materials.mockResolvedValue(MATERIALS);
    mocks.units.mockResolvedValue({ "00000002": ["each", "case"], "00000004": ["each"], "00000005": ["each"] });
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the BOM, its current recipe as entered, and every revision, with the admin's controls (BOM-020, MAT-019)", async () => {
    render(await resolveServerComponents(page()));

    expect(mocks.tenantScope).toHaveBeenCalledWith("prod");
    expect(mocks.get).toHaveBeenCalledWith("00000003");
    expect(mocks.getRevision).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("BOM 00000003 — Cabinet, red");
    expect(screen.getByRole("link", { name: "All BOMs" }).getAttribute("href")).toBe("/admin/prod/boms");
    expect(screen.getAllByRole("definition").map((value) => value.textContent)).toEqual([
      "00000005 Cabinet, red (each)",
      "Active",
      "rev 2",
      "2",
      "2026-01-01 – 2026-12-31",
      "2026-10-20",
    ]);
    expect(cells("Recipe (revision 2)")).toEqual([
      ["00000004Painted side panel", "4 each", ""],
      ["00000002Bolt M8Inactive", "24 each", "2 case at 1 case = 12 each"],
    ]);
    expect(cells("Revisions")).toEqual([
      ["rev 2Current", "2026-10-20 02:15", "2", "2026-01-01 – 2026-12-31"],
      ["rev 1", "2026-10-20 01:15", "2", "2026-01-01 – no end"],
    ]);
    expect(screen.getByRole("link", { name: "rev 2" }).getAttribute("href")).toBe("/admin/prod/boms/00000003");
    expect(screen.getByRole("link", { name: "rev 1" }).getAttribute("href")).toBe("/admin/prod/boms/00000003?revision=1");
    expect(screen.queryByRole("note")).toBeNull();
    // The inactive bolt stays offered: the current recipe keeps it (spec Q10).
    expect(screen.getByRole("button", { name: "controls 00000003 v3 00000002,00000004" })).toBeTruthy();
  });

  it("shows an older revision read-only under a notice, with a way back (BOM-020)", async () => {
    mocks.getRevision.mockResolvedValue({ bom: "00000003", ...revision(1, null), current: false, components: [{ ...bolts, quantity: "12.000000", enteredQuantity: "1" }] });

    render(await resolveServerComponents(page("1")));

    expect(mocks.getRevision).toHaveBeenCalledWith("00000003", 1);
    expect(screen.getByRole("heading", { level: 2, name: "Recipe (revision 1)" })).toBeTruthy();
    expect(screen.getByRole("note").textContent).toBe(
      "Revision 1 of 2: history, kept unchanged. Revision 2 is current. Show the current revision",
    );
    expect(cells("Recipe (revision 1)")).toEqual([["00000002Bolt M8Inactive", "12 each", "1 case at 1 case = 12 each"]]);
  });

  it("shows the current revision for its own number, and not-found for another or a malformed one", async () => {
    render(await resolveServerComponents(page("2")));
    expect(mocks.getRevision).not.toHaveBeenCalled();
    expect(screen.queryByRole("note")).toBeNull();

    mocks.getRevision.mockRejectedValueOnce(new mocks.AppError("BOM_REVISION_NOT_FOUND"));
    await expect(resolveServerComponents(page("9"))).rejects.toThrow("404");
    for (const bad of ["0", "x", ["1", "2"]]) await expect(resolveServerComponents(page(bad))).rejects.toThrow("404");
  });

  it("shows a normal user, or the admin of a read-only tenant, no control (TEN-004, R05)", async () => {
    mocks.requireUser.mockResolvedValue({ username: "alice", role: "user" });
    mocks.get.mockResolvedValue({ ...BOM, active: false, validThrough: null });
    const { unmount } = render(await resolveServerComponents(page()));
    expect(screen.getAllByRole("definition").map((value) => value.textContent).slice(1, 5)).toEqual(["Inactive", "rev 2", "2", "2026-01-01 – no end"]);
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    mocks.requireUser.mockResolvedValue({ username: "admin", role: "admin" });
    mocks.tenantScope.mockResolvedValue(scope(true));
    render(await resolveServerComponents(page()));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders not-found for an ID this tenant doesn't have (TEN-014)", async () => {
    mocks.get.mockRejectedValueOnce(new mocks.AppError("BOM_NOT_FOUND"));
    await expect(resolveServerComponents(page())).rejects.toThrow("404");
  });
});
