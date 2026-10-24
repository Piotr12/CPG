import { describe, expect, it } from "vitest";
import { activeOptions, materialChoices, materialPicks } from "./choices";

const material = (id: string, description: string, baseUnit: string, active = true) => ({
  id,
  type: "raw" as const,
  description,
  baseUnit,
  active,
  createdAt: new Date(),
  version: 1,
});

describe("purchasing choices", () => {
  it("offer the active materials with their base unit and the units they convert (MAT-029)", () => {
    const choices = materialChoices(
      [material("00000001", "Steel", "kg"), material("00000002", "Old rivet", "each", false)],
      { "00000001": ["kg", "t"], "00000002": ["each"] },
    );

    expect(choices).toEqual([{ value: "00000001", label: "00000001 — Steel (kg)", units: ["kg", "t"] }]);
  });

  it("offer the active materials to an autocomplete by ID and description, with the base unit as detail (#217)", () => {
    const picks = materialPicks(
      [material("00000001", "Steel", "kg"), material("00000002", "Old rivet", "each", false)],
      { "00000001": ["kg", "t"], "00000002": ["each"] },
    );

    expect(picks).toEqual([{ value: "00000001", code: "00000001", name: "Steel", detail: "kg", units: ["kg", "t"] }]);
  });

  it("offer the active suppliers or locations by business ID (LFC-019, LFC-023)", () => {
    const record = (id: string, name: string, active: boolean) => ({ id, name, active, createdAt: new Date(), version: 1 });

    expect(activeOptions([record("00000001", "Plant", true), record("00000002", "Quarry", false)])).toEqual([
      { value: "00000001", label: "00000001 — Plant" },
    ]);
  });
});
