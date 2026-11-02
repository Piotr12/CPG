import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MrpExceptionView, MrpPlanView, MrpProvisionalView, NamedRecordView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { MrpExplanations } from "./mrp-explanations";

const MATERIALS = new Map([
  ["00000001", { description: "Cake", baseUnit: "PCS" }],
  ["00000002", { description: "Cake base", baseUnit: "PCS" }],
  ["00000003", { description: "Flour", baseUnit: "KG" }],
  ["00000021", { description: "Colouring", baseUnit: "L" }],
]);
const LOCATIONS: NamedRecordView[] = [
  { id: "00000002", name: "Plant North", active: true, createdAt: new Date(0), version: 1 },
  { id: "00000003", name: "Warehouse", active: true, createdAt: new Date(0), version: 1 },
];
const plan = (material: string, description: string, overrides: Partial<MrpPlanView> = {}): MrpPlanView => ({
  material, materialDescription: description, materialActive: true, baseUnit: "PCS",
  location: "00000002", locationName: "Plant North", locationActive: true, lowestProjectedBefore: "-10.000000", firstShortageDate: "2026-11-09",
  buckets: [], proposals: [], exceptions: [], provisional: [], marks: [], ...overrides,
});
const action = (overrides: Partial<MrpProvisionalView> = {}): MrpProvisionalView => ({
  kind: "production-order", needDate: "2026-11-09", quantity: "20.000000", plannedStart: "2026-11-06", plannedFinish: "2026-11-09", lateDays: 0, beyondHorizon: false,
  bom: "00000011", bomRevision: 1, components: [{ material: "00000002", quantity: "20.000000" }], blockers: ["no-feasible-bom"], rejectedBoms: [], ...overrides,
});
const exception = (code: string, params: Record<string, string>, rejectedBoms?: MrpExceptionView["rejectedBoms"]): MrpExceptionView => ({
  code, message: "The API's English message", params: { material: "00000001", location: "00000002", ...params }, ...(rejectedBoms && { rejectedBoms }),
});
const shortOfBase = { bom: "00000011", revision: 1, reason: "shortage" as const, shortages: [{ material: "00000002", required: "20.000000", available: "0.000000", shortage: "20.000000" }] };

const renderExplanations = (plans: MrpPlanView[], { locale = "en" as "en" | "pl", view = {} as Record<string, string> } = {}) =>
  render(<MrpExplanations tenant={{ code: "test" }} plans={plans} materials={MATERIALS} locations={LOCATIONS} view={view} locale={locale} messages={locale === "en" ? en : pl} />);

describe("MrpExplanations (E18-S03)", () => {
  it("says so in one sentence when the page's pairs have nothing to explain", () => {
    renderExplanations([plan("00000001", "Cake")]);
    expect(screen.getByRole("heading", { level: 3, name: "Explanations" })).toBeTruthy();
    expect(document.querySelector("[data-mrp-explanations-empty]")?.textContent).toBe(en.mrp.explanations.empty);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("MRP-047: lists provisional plans apart, under a not-executable callout, each marked Provisional, with no action, linking each component to its pair", () => {
    const cake = plan("00000001", "Cake", { provisional: [action({ rejectedBoms: [shortOfBase] })] });
    const base = plan("00000002", "Cake base", {
      provisional: [action({ needDate: "2026-11-06", plannedStart: "2026-11-04", plannedFinish: "2026-11-06", bom: "00000012", components: [{ material: "00000003", quantity: "4.000000" }, { material: "00000099", quantity: "1.000000" }], blockers: ["no-feasible-bom", "provisional-demand"] })],
    });
    renderExplanations([cake, base], { view: { bucket: "week" } });

    const section = document.querySelector("[data-mrp-provisional]")!;
    const callout = section.querySelector("[data-slot=callout]")!;
    expect(callout.getAttribute("data-tone")).toBe("warning");
    expect(callout.textContent).toContain("Provisional — not executable");
    expect(callout.textContent).toContain("never counted as supply");
    const table = within(screen.getByRole("table", { name: en.mrp.explanations.provisional.label }));
    expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Material / location", "Need date", "Quantity", "BOM", "Components", "Blockers"]);
    const [first, second] = table.getAllByRole("row").slice(1);
    // Not colour alone: every row carries the Provisional label, and nothing can accept it.
    for (const row of [first, second]) {
      expect(row.querySelector("[data-slot=status-badge]")?.textContent).toBe("Provisional");
      expect(within(row).queryByRole("button", { name: /Accept/ })).toBeNull();
    }
    expect(first.textContent).toContain("00000001 Cake00000002 Plant North");
    expect(first.textContent).toContain("2026-11-09start 2026-11-06 · finish 2026-11-09");
    expect(first.querySelector("[data-mrp-provisional-quantity]")?.textContent).toBe("20 PCS");
    expect(first.textContent).toContain("BOM 00000011 / revision 1");
    const link = within(first).getByRole("link", { name: "Open 00000002 Cake base at 00000002 Plant North" });
    expect(link.getAttribute("href")).toBe("/admin/test/mrp?material=00000002&location=00000002&bucket=week");
    expect(first.querySelector("[data-mrp-provisional-component]")?.textContent).toBe("00000002 Cake base 20 PCS");
    // The chain goes on down: I's own row names R, the raw material, and a component the screen doesn't know shows its code alone.
    expect([...second.querySelectorAll("[data-mrp-provisional-component]")].map((item) => item.textContent)).toEqual(["00000003 Flour 4 KG", "00000099 1"]);
    expect([...second.querySelectorAll("[data-slot=status-badge]")].map((badge) => badge.textContent)).toEqual(["Provisional", "No feasible BOM", "Provisional demand"]);
    expect(second.querySelector("[data-mrp-why-bom]")).toBeNull();
    fireEvent.click(within(first).getByRole("button", { name: "Why this BOM (1 rejected)" }));
    expect(first.querySelector("[data-mrp-shortage]")?.textContent).toBe("00000002 Cake base: needs 20 PCS, dependable 0 PCS, short 20 PCS");
  });

  it("MRP-051, LFC-027: lists an at-risk order with its unproduced balance, inactive component and label, linking to the order, never among the exceptions", () => {
    renderExplanations([plan("00000001", "Cake", { exceptions: [exception("AT_RISK_PRODUCTION", { date: "2026-11-05", order: "00000017", quantity: "10.000000", inactiveComponents: "00000021, 00000098" })] })]);

    const table = within(screen.getByRole("table", { name: en.mrp.explanations.atRisk.label }));
    expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Order", "Material / location", "Finish", "Unproduced", "Inactive components", "Status"]);
    const row = table.getAllByRole("row")[1];
    expect(within(row).getByRole("link", { name: "Find production order 00000017" }).getAttribute("href")).toBe("/admin/test/production-orders?q=00000017");
    expect(row.textContent).toContain("2026-11-05");
    expect(row.querySelector("[data-mrp-at-risk-quantity]")?.textContent).toBe("10 PCS");
    expect(row.querySelector("[data-mrp-at-risk-inactive]")?.textContent).toBe("00000021 Colouring, 00000098");
    expect(row.querySelector("[data-slot=status-badge]")?.textContent).toBe("At-Risk Existing Production / Inactive BOM Component");
    expect(document.querySelector("[data-mrp-exceptions]")).toBeNull();
    expect(document.querySelector("[data-mrp-explanations-empty]")).toBeNull();
  });

  it("lists every other exception with its type, material, location, date and translated explanation, and the BOMs a parent exception rejected", () => {
    const transfer = { transfer: "00000009", destination: "00000003", planned: "30.000000", available: "12.500000", date: "2026-11-03" };
    renderExplanations([
      plan("00000001", "Cake", { exceptions: [exception("NO_FEASIBLE_BOM", { date: "2026-11-09", missing: "", order: "00000011/1" }, [shortOfBase]), exception("INSUFFICIENT_TRANSFER_STOCK", transfer)] }),
      plan("00000003", "Flour", { baseUnit: "KG", exceptions: [exception("MISSING_PLANNING_PARAMETERS", { material: "00000003", reason: "no-set" }), exception("A_NEWER_CODE", { material: "00000003" })] }),
    ]);

    const table = within(screen.getByRole("table", { name: en.mrp.explanations.exceptions.label }));
    expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Type", "Material", "Location", "Date", "Explanation"]);
    const rows = table.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector("[data-mrp-exception-code]")?.getAttribute("data-mrp-exception-code"))).toEqual(["NO_FEASIBLE_BOM", "INSUFFICIENT_TRANSFER_STOCK", "MISSING_PLANNING_PARAMETERS", "A_NEWER_CODE"]);
    expect(rows.map((row) => row.querySelector("[data-slot=status-badge]")?.textContent)).toEqual(["No Feasible BOM", "Insufficient Transfer Stock", "Missing Planning Parameters", "MRP exception"]);
    const [parent, short, missing, unknown] = rows;
    // The parent planning exception names each rejected BOM and its reason (LFC-026, MRP-050).
    expect(parent.textContent).toContain("00000001 Cake00000002 Plant North2026-11-09");
    expect(parent.querySelector("[data-mrp-exception-text] > span")?.textContent).toBe(en.mrp.explanations.exceptions.codes.NO_FEASIBLE_BOM.text);
    expect(parent.querySelector("[data-mrp-shortage]")?.textContent).toBe("00000002 Cake base: needs 20 PCS, dependable 0 PCS, short 20 PCS");
    expect(short.querySelector("[data-mrp-exception-text]")?.textContent).toBe(
      "Transfer 00000009 to 00000003 Warehouse plans 30 PCS, but only 12.5 PCS is available at the source on its dispatch day, so only that part is planned.",
    );
    expect(short.querySelector("[data-mrp-rejections]")).toBeNull();
    // A date-less exception shows a dash.
    expect(missing.textContent).toContain("00000003 Flour00000002 Plant North—");
    expect(unknown.querySelector("[data-mrp-exception-text]")?.textContent).toBe("MRP raised an exception for this material at this location.");
  });

  it("names a destination the screen doesn't know by its code, and says it all in Polish", () => {
    renderExplanations(
      [plan("00000001", "Cake", { exceptions: [exception("INSUFFICIENT_TRANSFER_STOCK", { transfer: "00000009", destination: "00000077", planned: "3.000000", available: "1.000000", date: "2026-11-03" }), exception("AT_RISK_PRODUCTION", { date: "2026-11-05", order: "00000017", quantity: "2.500000", inactiveComponents: "00000021" })] })],
      { locale: "pl" },
    );
    expect(screen.getByRole("heading", { level: 3, name: "Wyjaśnienia" })).toBeTruthy();
    expect(document.querySelector("[data-mrp-exception-text]")?.textContent).toBe("Przesunięcie 00000009 do 00000077 planuje 3 PCS, ale w dniu wysyłki źródło ma tylko 1 PCS, więc planowana jest tylko ta część.");
    expect(document.querySelector("[data-mrp-at-risk] [data-slot=status-badge]")?.textContent).toBe("Zagrożona istniejąca produkcja / Nieaktywny składnik BOM-u");
    expect(document.querySelector("[data-mrp-at-risk-quantity]")?.textContent).toBe("2,5 PCS");
  });
});
