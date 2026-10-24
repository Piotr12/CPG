import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { SafetyStockScreen } from "./safety-stock-screen";

vi.mock("./add-safety-stock-target-dialog", () => ({ AddSafetyStockTargetDialog: () => <button>Add target</button> }));
vi.mock("./safety-stock-target-actions", () => ({ SafetyStockTargetActions: () => <button>Row actions</button> }));

const MATERIALS = [{ id: "00000005", type: "finished" as const, description: "Cabinet", baseUnit: "each", active: true, createdAt: new Date(), version: 1 }];
const LOCATIONS = [{ id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 }];
const target = (effectiveFrom: string) => ({ material: "00000005", location: "00000001", effectiveFrom, quantity: "10.000000", version: 1 });
const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };
const renderScreen = (targets: object[], admin = true) =>
  render(
    <SafetyStockScreen
      tenant={TENANT}
      targets={targets as never}
      materials={MATERIALS}
      locations={LOCATIONS}
      today="2027-01-15"
      locale="en"
      messages={en}
      admin={admin}
    />,
  );

describe("SafetyStockScreen", () => {
  it("heads the list with the one h1 and Add target, then each target's state from the tone map", () => {
    renderScreen([target("2026-12-01"), target("2027-01-01"), target("2027-02-01")]);

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Safety stock — Test");
    expect(within(header).getByText(/2027-01-15/)).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Add target" })).toBeTruthy();
    const badges = screen.getAllByRole("row").slice(1).map((row) => {
      const badge = row.querySelector("[data-slot=status-badge]") as HTMLElement;
      return [badge.textContent, badge.dataset.tone];
    });
    expect(badges).toEqual([
      ["Superseded", "neutral"],
      ["In effect", "success"],
      ["Scheduled", "neutral"],
    ]);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[2].className).toMatch(/\bwhitespace-nowrap\b/);
    expect(cells[3].className).toMatch(/\btext-right tabular-nums\b/);
  });

  it("tells a reader whom to ask when there are no targets", () => {
    renderScreen([], false);

    expect(screen.getByText("Ask an administrator to add safety-stock targets.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
