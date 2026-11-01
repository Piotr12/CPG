import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MrpMarkView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { markText, MrpMarks, shortDate } from "./mrp-marks";

const TODAY = "2026-10-01";
const po: MrpMarkView = { kind: "overdue-supply", date: TODAY, source: "purchase-order", document: "00000003", position: 1, plannedDate: "2026-09-28", quantity: "30.000000" };

describe("markText", () => {
  it.each([
    [po, "Overdue · PO 00000003/1 · due Sep 28 · 30 KG"],
    [{ ...po, source: "requisition", position: null, document: "00000004", quantity: "7.5" } as MrpMarkView, "Overdue · Requisition 00000004 · due Sep 28 · 7.5 KG"],
    [{ ...po, source: "production-order", position: null } as MrpMarkView, "Overdue · Production order 00000003 · due Sep 28 · 30 KG"],
    [{ kind: "overdue-transfer", date: TODAY, transfer: "00000002", stage: "planned", plannedDate: "2026-09-30", quantity: "25.000000" } as MrpMarkView, "Overdue Transfer · Transfer 00000002 · due Sep 30 · 25 KG"],
    [{ kind: "late-supply", date: "2026-10-04", proposal: "p", plannedFinish: "2026-10-05", lateDays: 1, quantity: "1234.5" } as MrpMarkView, "Late Supply · 1 day · finish Oct 5 · 1,234.5 KG"],
    [{ kind: "beyond-horizon", date: "2026-10-15", proposal: "p", plannedFinish: "2027-01-09", lateDays: 86, quantity: "40.000000" } as MrpMarkView, "Beyond Horizon · finish Jan 9, 2027 · 40 KG"],
  ])("names %o in English", (mark, text) => {
    expect(markText(mark, "KG", "en", en.mrp.report.marks)).toBe(text);
  });

  it("speaks Polish, with its plural forms of days", () => {
    const late = (lateDays: number): MrpMarkView => ({ kind: "late-supply", date: "2026-10-04", proposal: "p", plannedFinish: "2026-10-08", lateDays, quantity: "12.000000" });
    expect(markText(po, "kg", "pl", pl.mrp.report.marks)).toBe("Zaległa dostawa · Zamówienie 00000003/1 · termin 28 wrz · 30 kg");
    expect([1, 4, 5].map((days) => markText(late(days), "kg", "pl", pl.mrp.report.marks).split(" · ")[1])).toEqual(["1 dzień", "4 dni", "5 dni"]);
  });
});

describe("shortDate", () => {
  it("adds the year only when it isn't the mark's own year", () => {
    expect(shortDate("2026-12-29", TODAY, "en")).toBe("Dec 29");
    expect(shortDate("2027-01-09", TODAY, "pl")).toBe("9 sty 2027");
  });
});

describe("MrpMarks", () => {
  it("renders nothing without marks, and one warning badge with an icon per mark", () => {
    const { container, rerender } = render(<MrpMarks marks={[]} unit="KG" locale="en" labels={en.mrp.report.marks} />);
    expect(container.innerHTML).toBe("");
    rerender(<MrpMarks marks={[po, { ...po, document: "00000009" }]} unit="KG" locale="en" labels={en.mrp.report.marks} />);
    const badges = [...container.querySelectorAll("[data-slot=status-badge]")];
    expect(badges).toHaveLength(2);
    expect(badges.every((badge) => badge.getAttribute("data-tone") === "warning" && badge.querySelector("svg[aria-hidden=true]"))).toBe(true);
  });
});
