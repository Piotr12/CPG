import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { ConversionsTable } from "./conversions-table";
import { materialsLabels } from "./labels";

vi.mock("./conversion-actions", () => ({
  ConversionActions: ({ conversion }: { conversion: { unit: string } }) => <button>menu {conversion.unit}</button>,
}));

const context = { tenant: "test", generation: 1 };
const kg = { id: "00000001", type: "raw" as const, description: "Steel", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 };
const conversions = [
  { unit: "t", numerator: "1000", denominator: "1", inverse: "0.001", version: 1 },
  { unit: "ship", numerator: "10000000", denominator: "1", inverse: "0", version: 1 },
];

describe("ConversionsTable", () => {
  it("reads each conversion as a sentence with its indicative inverse (MAT-020, MAT-021)", () => {
    render(<ConversionsTable material={kg} conversions={conversions} context={context} labels={materialsLabels(en)} editable />);

    const rows = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual(["t1 t = 1000 kg1 kg = 0.001 tmenu t", "ship1 ship = 10000000 kg1 kg = < 0.000001 shipmenu ship"]);
  });

  it("shows no row menu to a normal user (TEN-004), and an empty state", () => {
    const { rerender } = render(
      <ConversionsTable material={kg} conversions={conversions} context={context} labels={materialsLabels(en)} editable={false} />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<ConversionsTable material={kg} conversions={[]} context={context} labels={materialsLabels(en)} editable={false} />);
    expect(screen.getByText("No conversions: quantities of this material are entered in its base unit.")).toBeTruthy();
  });
});
