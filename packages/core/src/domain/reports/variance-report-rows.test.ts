import { describe, expect, it } from "vitest";
import { OrderTally, type TallyLine } from "./variance-report-rows";

const line = (material: string, position: number, expected: string, actual: string, variance: string, extra = false): TallyLine => ({
  material,
  position,
  extra,
  expected,
  actual,
  variance,
});
const codes: Record<string, string> = { cocoa: "00000002", wrapper: "00000003", milk: "00000004", filling: "00000005", sugar: "00000006" };
const codeOf = (material: string) => codes[material];

describe("OrderTally", () => {
  it("sums each component's stored expected, actual and variance over the completions (PRD-013, PRD-014, PRD-015)", () => {
    const tally = new OrderTally();
    expect(tally.addCompletion("30.000000")).toBe(false);
    tally.addLine(line("cocoa", 0, "15.000000", "14.000000", "-1.000000"), false);
    tally.addLine(line("milk", 2, "0.000000", "2.000000", "2.000000", true), false);
    expect(tally.addCompletion("10.000000")).toBe(false);
    tally.addLine(line("cocoa", 0, "5.000000", "4.000000", "-1.000000"), false);

    expect(tally.figures("40.000000", codeOf, { partial: false })).toEqual({
      produced: "40.000000",
      outputVariance: "0.000000",
      completions: 2,
      wasteCompletions: 0,
      components: [
        { material: "00000002", extra: false, expected: "20.000000", actual: "18.000000", variance: "-2.000000", waste: "0.000000" },
        { material: "00000004", extra: true, expected: "0.000000", actual: "2.000000", variance: "2.000000", waste: "0.000000" },
      ],
    });
  });

  it("counts a zero-output completion as a waste posting, and its actuals as each component's waste (PRD-018)", () => {
    const tally = new OrderTally();
    tally.addCompletion("10.000000");
    tally.addLine(line("cocoa", 0, "5.000000", "5.000000", "0.000000"), false);
    expect(tally.addCompletion("0.000000")).toBe(true);
    tally.addLine(line("cocoa", 0, "0.000000", "3.500000", "3.500000"), true);

    const figures = tally.figures("100.000000", codeOf, { partial: false });
    expect(figures).toMatchObject({ produced: "10.000000", outputVariance: "-90.000000", completions: 2, wasteCompletions: 1 });
    expect(figures.components).toEqual([{ material: "00000002", extra: false, expected: "5.000000", actual: "8.500000", variance: "3.500000", waste: "3.500000" }]);
  });

  it("puts pinned components in recipe order first, then extra inputs by material ID whatever their positions", () => {
    const tally = new OrderTally();
    tally.addCompletion("1.000000");
    tally.addLine(line("filling", 3, "0.000000", "1.000000", "1.000000", true), false);
    tally.addLine(line("sugar", 4, "0.000000", "1.000000", "1.000000", true), false);
    tally.addLine(line("wrapper", 1, "2.000000", "2.000000", "0.000000"), false);
    tally.addLine(line("milk", 2, "0.000000", "1.000000", "1.000000", true), false);
    tally.addLine(line("cocoa", 0, "0.500000", "0.500000", "0.000000"), false);
    tally.addCompletion("1.000000");
    tally.addLine(line("filling", 2, "0.000000", "1.000000", "1.000000", true), false);
    tally.addLine(line("milk", 3, "0.000000", "1.000000", "1.000000", true), false);

    expect(tally.figures("2.000000", codeOf, { partial: false }).components.map(({ material }) => material)).toEqual(["00000002", "00000003", "00000004", "00000005", "00000006"]);
  });

  it("gives no output variance when only part of the order's output is in view, and an empty order produced nothing", () => {
    const tally = new OrderTally();
    expect(tally.figures("25.000000", codeOf, { partial: true })).toEqual({ produced: "0.000000", outputVariance: null, completions: 0, wasteCompletions: 0, components: [] });
    expect(tally.figures("25.000000", codeOf, { partial: false }).outputVariance).toBe("-25.000000");
  });

  it("shows overproduction as a positive output variance", () => {
    const tally = new OrderTally();
    tally.addCompletion("12.500000");
    expect(tally.figures("10.000000", codeOf, { partial: false }).outputVariance).toBe("2.500000");
  });
});
