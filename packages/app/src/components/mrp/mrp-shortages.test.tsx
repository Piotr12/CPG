import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MrpShortageView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { MrpShortages, shortagesByDate, shortageText } from "./mrp-shortages";

const MONDAY = "2026-10-05";
const entry = (fields: Partial<MrpShortageView>): MrpShortageView => ({
  kind: "forecast", date: MONDAY, originalDate: MONDAY, document: null, position: null, required: "20.000000", uncovered: "15.000000", root: null, ...fields,
});
const order = entry({ kind: "customer-order", document: "00000012", position: 1, originalDate: "2026-10-07", date: "2026-10-07", required: "10.000000", uncovered: "8.000000" });
const planned = (kind: NonNullable<MrpShortageView["root"]>["kind"]) =>
  entry({ kind: "planned-component", document: "00000031", originalDate: "2026-10-07", date: MONDAY, required: "4.000000", uncovered: "3.000000", root: { kind, originalDate: "2026-10-07" } });

describe("shortageText (#380, spec Q6)", () => {
  it.each([
    [order, "Customer order 00000012, line 2 · due Oct 7 · 8 kg short of 10 kg"],
    [entry({}), "Forecast · Oct 5 · 15 kg short of 20 kg"],
    [entry({ kind: "safety-target", required: "25.000000", uncovered: "13.000000" }), "Safety stock · 13 kg short of 25 kg"],
    [entry({ kind: "component", document: "00000004", originalDate: "2026-10-06", date: "2026-10-06" }), "Production order 00000004 · start Oct 6 · 15 kg short of 20 kg"],
    [entry({ kind: "transfer", document: "00000002", originalDate: "2026-10-06", date: "2026-10-06" }), "Transfer 00000002 · dispatch Oct 6 · 15 kg short of 20 kg"],
    [planned("customer-order"), "Proposed production of 00000031 · for customer orders due Oct 7 · 3 kg short of 4 kg"],
    [planned("forecast"), "Proposed production of 00000031 · for the forecast of Oct 7 · 3 kg short of 4 kg"],
    [planned("safety-target"), "Proposed production of 00000031 · for safety stock · 3 kg short of 4 kg"],
    [planned("component"), "Proposed production of 00000031 · for production orders starting Oct 7 · 3 kg short of 4 kg"],
    [planned("transfer"), "Proposed production of 00000031 · for transfers dispatched Oct 7 · 3 kg short of 4 kg"],
  ])("names %o in English", (shortage, text) => {
    expect(shortageText(shortage, "kg", "en", en.mrp.report.shortages)).toBe(text);
  });

  it("gives an overdue order's due date its year when it isn't the day's, and the quantities in the reader's locale", () => {
    const overdue = { ...order, date: "2027-01-02", originalDate: "2026-12-28", required: "1234.500000", uncovered: "1234.500000" };
    expect(shortageText(overdue, "kg", "en", en.mrp.report.shortages)).toBe("Customer order 00000012, line 2 · due Dec 28, 2026 · 1,234.5 kg short of 1,234.5 kg");
  });

  it("speaks Polish", () => {
    const t = pl.mrp.report.shortages;
    expect(shortageText(order, "kg", "pl", t)).toBe("Zamówienie klienta 00000012, pozycja 2 · termin 7 paź · brakuje 8 kg z 10 kg");
    expect(shortageText(entry({}), "kg", "pl", t)).toBe("Prognoza · 5 paź · brakuje 15 kg z 20 kg");
    expect(shortageText(entry({ kind: "safety-target" }), "kg", "pl", t)).toBe("Zapas bezpieczeństwa · brakuje 15 kg z 20 kg");
    expect(shortageText(entry({ kind: "component", document: "00000004" }), "kg", "pl", t)).toBe("Zlecenie produkcyjne 00000004 · start 5 paź · brakuje 15 kg z 20 kg");
    expect(shortageText(entry({ kind: "transfer", document: "00000002" }), "kg", "pl", t)).toBe("Przesunięcie 00000002 · wysyłka 5 paź · brakuje 15 kg z 20 kg");
    expect(shortageText(planned("customer-order"), "kg", "pl", t)).toBe("Proponowana produkcja 00000031 · dla zamówień klientów z terminem 7 paź · brakuje 3 kg z 4 kg");
    expect(shortageText(planned("forecast"), "kg", "pl", t)).toBe("Proponowana produkcja 00000031 · dla prognozy na 7 paź · brakuje 3 kg z 4 kg");
    expect(shortageText(planned("safety-target"), "kg", "pl", t)).toBe("Proponowana produkcja 00000031 · dla zapasu bezpieczeństwa · brakuje 3 kg z 4 kg");
    expect(shortageText(planned("component"), "kg", "pl", t)).toBe("Proponowana produkcja 00000031 · dla zleceń produkcyjnych startujących 7 paź · brakuje 3 kg z 4 kg");
    expect(shortageText(planned("transfer"), "kg", "pl", t)).toBe("Proponowana produkcja 00000031 · dla przesunięć wysyłanych 7 paź · brakuje 3 kg z 4 kg");
  });
});

describe("MrpShortages (#380, spec Q5)", () => {
  it("lists a day's entries as an ordered list, in the order given, which is the order MRP serves them", () => {
    const { container } = render(
      <MrpShortages shortages={[order, entry({}), entry({ kind: "safety-target" })]} unit="kg" locale="en" labels={en.mrp.report.shortages} />,
    );
    const list = container.querySelector("ol[data-mrp-shortages]")!;
    expect([...list.querySelectorAll("li")].map((item) => [item.dataset.mrpShortage, item.textContent])).toEqual([
      ["customer-order", "Customer order 00000012, line 2 · due Oct 7 · 8 kg short of 10 kg"],
      ["forecast", "Forecast · Oct 5 · 15 kg short of 20 kg"],
      ["safety-target", "Safety stock · 15 kg short of 20 kg"],
    ]);
  });

  it("renders nothing on a day with none", () => {
    const { container } = render(<MrpShortages shortages={[]} unit="kg" locale="en" labels={en.mrp.report.shortages} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("shortagesByDate (#391)", () => {
  it("groups a plan's entries by their day in one pass, each day keeping its entries in the order given", () => {
    const tuesday = "2026-10-06";
    const first = entry({ kind: "forecast" });
    const second = entry({ kind: "transfer", date: tuesday, document: "00000002" });
    const third = entry({ kind: "safety-target" });
    const fourth = entry({ kind: "component", date: tuesday, document: "00000004" });
    const fifth = entry({ kind: "customer-order", document: "00000012", position: 0 });

    const days = shortagesByDate([first, second, third, fourth, fifth]);

    expect([...days.keys()]).toEqual([MONDAY, tuesday]);
    expect(days.get(MONDAY)).toEqual([first, third, fifth]);
    expect(days.get(tuesday)).toEqual([second, fourth]);
    expect(days.get("2026-10-07")).toBeUndefined();
  });

  it("has no days for a plan with no shortages", () => {
    expect(shortagesByDate([]).size).toBe(0);
  });
});
