import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
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
    render(<ConversionsTable material={kg} conversions={conversions} context={context} labels={materialsLabels(en)} locale="en" editable />);

    const rows = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual(["t1 t = 1,000 kg1 kg = 0.001 tmenu t", "ship1 ship = 10,000,000 kg1 kg = < 0.000001 shipmenu ship"]);
  });

  it("writes the factors and the inverse in the reader's locale (#304)", () => {
    const pallet = { unit: "pallet", numerator: "12345.5", denominator: "2.5", inverse: "0.000203", version: 1 };
    render(<ConversionsTable material={kg} conversions={[pallet, conversions[1]]} context={context} labels={materialsLabels(pl)} locale="pl" editable={false} />);

    const rows = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual(["pallet2,5 pallet = 12\u00a0345,5 kg1 kg = 0,000203 pallet", "ship1 ship = 10\u00a0000\u00a0000 kg1 kg = < 0,000001 ship"]);
  });

  it("shows no row menu to a normal user (TEN-004), and an empty state", () => {
    const { rerender } = render(
      <ConversionsTable material={kg} conversions={conversions} context={context} labels={materialsLabels(en)} locale="en" editable={false} />,
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<ConversionsTable material={kg} conversions={[]} context={context} labels={materialsLabels(en)} locale="en" editable={false} />);
    expect(screen.getByText("No conversions: quantities of this material are entered in its base unit.")).toBeTruthy();
  });
});
