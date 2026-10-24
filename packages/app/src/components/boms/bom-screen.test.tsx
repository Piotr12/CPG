import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { BomScreen } from "./bom-screen";

vi.mock("./bom-controls", () => ({ BomControls: ({ bom }: { bom: { id: string } }) => <button>{`controls ${bom.id}`}</button> }));

const material = (id: string, description: string, active = true) => ({
  id,
  type: "raw" as const,
  description,
  baseUnit: "each",
  active,
  createdAt: new Date(),
  version: 1,
});
const MATERIALS = [material("00000002", "Bolt M8", false), material("00000005", "Cabinet, red")];
const bolts = { material: "00000002", quantity: "24.000000", enteredQuantity: "24", enteredUnit: "each", numerator: "1", denominator: "1" };
const revision = (number: number) => ({ number, priority: 2, validFrom: "2026-01-01", validThrough: null, createdAt: new Date(`2026-10-20T0${number}:15:00Z`) });
const BOM = {
  id: "00000003",
  output: "00000005",
  active: true,
  revision: 2,
  priority: 2,
  validFrom: "2026-01-01",
  validThrough: null,
  components: [bolts],
  createdAt: new Date("2026-10-20T01:15:00Z"),
  version: 3,
  revisions: [revision(2), revision(1)],
};
const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };

const renderScreen = (overrides: { bom?: object; historic?: object | null; admin?: boolean; tenant?: object } = {}) =>
  render(
    <BomScreen
      tenant={{ ...TENANT, ...overrides.tenant }}
      bom={{ ...BOM, ...overrides.bom } as never}
      historic={(overrides.historic ?? null) as never}
      materials={MATERIALS}
      units={{}}
      locale="en"
      messages={en}
      admin={overrides.admin ?? true}
    />,
  );

describe("BomScreen", () => {
  it("heads the page with the BOM and its state, the admin's controls as the header's actions", () => {
    renderScreen();

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("BOM 00000003 — Cabinet, red");
    const state = within(header).getByText("Active");
    expect(state.dataset.slot).toBe("status-badge");
    expect(state.dataset.tone).toBe("neutral");
    expect(within(header).getByRole("button", { name: "controls 00000003" })).toBeTruthy();
    // The state shows once, in the header, not again in the summary.
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "All BOMs" }).getAttribute("href")).toBe("/admin/test/boms");
  });

  it("marks an inactive BOM with the dashed quiet badge, and an inactive component beside its ID", () => {
    renderScreen({ bom: { active: false }, admin: false });

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    const state = within(header).getByText("Inactive");
    expect(state.dataset.tone).toBe("neutral");
    expect(state.className).toContain("border-dashed");
    expect(within(header).queryByRole("button")).toBeNull();
    const recipe = screen.getByRole("table", { name: "Components (revision 2)" });
    expect(within(recipe).getByText("Inactive").dataset.slot).toBe("status-badge");
    const quantity = within(recipe).getByText("24 each");
    expect(quantity.className).toMatch(/\btext-right tabular-nums\b/);
  });

  it("shows an older revision under a warning note linking back to the current one", () => {
    renderScreen({ historic: { number: 1, priority: 2, validFrom: "2026-01-01", validThrough: null, components: [bolts] } });

    const note = screen.getByRole("note");
    expect(note.dataset.slot).toBe("callout");
    expect(note.dataset.tone).toBe("warning");
    expect(within(note).getByRole("link", { name: en.boms.revisions.showCurrent }).getAttribute("href")).toBe("/admin/test/boms/00000003");
  });

  it("gives the admin of a read-only tenant no controls", () => {
    renderScreen({ tenant: { readOnly: true } });

    expect(screen.queryByRole("button")).toBeNull();
  });
});
