import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { materialsLabels } from "./labels";
import { MaterialsTable } from "./materials-table";

const material = (id: string, overrides: object = {}) => ({
  id,
  type: "raw" as const,
  description: `Material ${id}`,
  baseUnit: "kg",
  active: true,
  createdAt: new Date(),
  version: 1,
  ...overrides,
});

describe("MaterialsTable", () => {
  it("lists ID, description, type, base unit and status, each ID opening the material", () => {
    render(
      <MaterialsTable
        tenant="prod"
        materials={[material("00000001"), material("00000002", { type: "finished", active: false, description: "Old cabinet" })]}
        labels={materialsLabels(en)}
      />,
    );

    expect(screen.getByRole("table", { name: "Materials" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "00000002" }).getAttribute("href")).toBe("/admin/prod/materials/00000002");
    expect(screen.getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      "00000001Material 00000001RawkgActive",
      "00000002Old cabinetFinishedkgInactive",
    ]);
    expect(screen.getByText("Old cabinet").className).toContain("text-muted-foreground");
  });

  it("says when the tenant has none", () => {
    render(<MaterialsTable tenant="prod" materials={[]} labels={materialsLabels(en)} />);

    expect(screen.getByText("No materials in this tenant yet.")).toBeTruthy();
  });
});
