import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { BomsScreen } from "./boms-screen";

vi.mock("./create-bom-dialog", () => ({ CreateBomDialog: () => <button>Create BOM</button> }));

const material = (id: string, description: string, active = true) => ({
  id,
  type: "finished" as const,
  description,
  baseUnit: "each",
  active,
  createdAt: new Date(),
  version: 1,
});
const MATERIALS = [material("00000002", "Bolt M8"), material("00000005", "Old cabinet", false)];
const bom = (id: string, active: boolean) => ({
  id,
  output: "00000005",
  active,
  revision: 1,
  priority: 1,
  validFrom: "2026-01-01",
  validThrough: null,
  components: [{ material: "00000002", quantity: "4.000000", enteredQuantity: "4", enteredUnit: "each", numerator: "1", denominator: "1" }],
  createdAt: new Date(),
  version: 1,
});
const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };

const renderScreen = (boms: object[], admin = true, readOnly = false) =>
  render(
    <BomsScreen tenant={{ ...TENANT, readOnly }} boms={boms as never} materials={MATERIALS} units={{}} locale="en" messages={en} admin={admin} />,
  );

describe("BomsScreen", () => {
  it("heads the list with the one h1, its intro and the admin's actions", () => {
    renderScreen([bom("00000001", true)]);

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["BOMs — Test"]);
    expect(within(header).getByText(en.boms.intro)).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Create BOM" })).toBeTruthy();
    expect(within(header).getByRole("link", { name: en.imports.link })).toBeTruthy();
  });

  it("shows each BOM's state and an inactive output from the tone map, and its quantities right-aligned", () => {
    renderScreen([bom("00000001", true), bom("00000003", false)], false);

    const [active, inactive] = screen.getAllByRole("row").slice(1);
    expect(within(active).getAllByText("Inactive").map((badge) => badge.dataset.slot)).toEqual(["status-badge"]);
    expect(within(active).getByText("Active").dataset.tone).toBe("neutral");
    expect(within(inactive).getAllByText("Inactive").every((badge) => badge.dataset.tone === "neutral" && badge.className.includes("border-dashed"))).toBe(true);
    const cells = within(active).getAllByRole("cell");
    expect(cells[0].className).toMatch(/\bfont-mono\b.*\bsticky left-0\b/);
    expect(cells[2].className).toMatch(/\btext-right tabular-nums\b/);
    // The component summary gives way below lg; revision and validity below md.
    expect(cells[6].className).toContain("hidden lg:table-cell");
    expect(cells[3].className).toContain("hidden md:table-cell");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says what is missing and the next step, by role", () => {
    const { unmount } = renderScreen([], true);
    expect(screen.getByText("No BOMs in Test yet. Create the first one with Create BOM.")).toBeTruthy();
    unmount();

    renderScreen([], true, true);
    expect(screen.getByText("Ask an administrator to add BOMs.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
