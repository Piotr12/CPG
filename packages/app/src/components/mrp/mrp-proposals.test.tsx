import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MrpMarkView, MrpPlanView, MrpProposalView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { MrpProposals } from "./mrp-proposals";

const RUN = { id: "00000004", startDate: "2026-10-01" };
const MATERIALS = new Map([["00000013", { description: "Sugar", baseUnit: "KG" }], ["00000021", { description: "Colouring", baseUnit: "L" }]]);
const buy = (overrides: Partial<MrpProposalView> = {}): MrpProposalView => ({
  id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", kind: "purchase-requisition", needDate: "2026-10-05", quantity: "100.000000", plannedStart: "2026-10-03", plannedFinish: "2026-10-05", lateDays: 0, beyondHorizon: false, executable: true, document: null, bom: null, bomRevision: null, rejectedBoms: [], ...overrides,
});
const plan = (proposals: MrpProposalView[]): MrpPlanView => ({
  material: "00000031", materialDescription: "Sugar", materialActive: true, baseUnit: "kg",
  location: "00000002", locationName: "Plant North", locationActive: true, lowestProjectedBefore: "-100.000000", firstShortageDate: "2026-10-05",
  buckets: [], proposals, exceptions: [], provisional: [],
  // The read's marks of these proposals (planMarks): a late one on its need date.
  marks: proposals.filter(({ lateDays }) => lateDays > 0).map(({ id, needDate, plannedFinish, lateDays, beyondHorizon, quantity }): MrpMarkView => ({
    kind: beyondHorizon ? "beyond-horizon" : "late-supply", date: needDate, proposal: id, plannedFinish, lateDays, quantity,
  })),
});
const accept = vi.fn();
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const renderProposals = (proposals: MrpProposalView[], { today = "2026-10-01", writable = true, locale = "en" as "en" | "pl" } = {}) =>
  render(
    <MrpProposals tenant={{ code: "test" }} run={RUN} plan={plan(proposals)} today={today} materials={MATERIALS} accept={writable ? accept : undefined} locale={locale} messages={locale === "en" ? en : pl} />,
  );
const table = () => within(screen.getByRole("table", { name: en.mrp.proposals.label }));
afterEach(() => vi.clearAllMocks());

describe("MrpProposals", () => {
  it("lists the pair's proposals with their document, need date and quantity, and what can be done with each (E19-S01)", () => {
    renderProposals([
      buy({ id: "a", needDate: "2026-10-03", quantity: "48.000000", document: "00000012" }),
      buy({ id: "b" }),
      buy({ id: "c", kind: "production-order", needDate: "2026-10-08", quantity: "12.5", executable: false }),
    ]);

    expect(screen.getByRole("heading", { level: 3, name: "Proposals for 00000031 Sugar at 00000002 Plant North" })).toBeTruthy();
    expect(table().getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Document", "Need date", "Quantity", "Accept"]);
    const [accepted, open, make] = table().getAllByRole("row").slice(1);
    expect(within(accepted).getByText("Purchase requisition")).toBeTruthy();
    expect(accepted.querySelector("[data-mrp-proposal-quantity]")?.textContent).toBe("48 kg");
    const link = within(accepted).getByRole("link", { name: "Purchase requisition 00000012" });
    expect(link.getAttribute("href")).toBe("/admin/test/purchase-requisitions?q=00000012");
    expect(accepted.querySelector("[data-mrp-accept]")).toBeNull();
    expect(within(open).getByRole("button", { name: "Accept the Purchase requisition of 100 kg on 2026-10-05" }).textContent).toBe("Accept");
    expect(within(make).getByText("Production order")).toBeTruthy();
    expect(make.querySelector("[data-mrp-not-executable]")?.textContent).toBe(en.mrp.proposals.notExecutable);
    expect(make.querySelector("[data-mrp-accept]")).toBeNull();
    expect(screen.queryByText(en.mrp.proposals.earlierDay)).toBeNull();
    expect(document.querySelector("[data-mrp-timing]")).toBeNull();
  });

  it.each([
    ["en", "Late Supply · 4 days · finish Oct 8 · 100 kg", "Beyond Horizon · finish Jan 29, 2027 · 100 kg"],
    ["pl", "Opóźniona dostawa · 4 dni · koniec 8 paź · 100 kg", "Poza horyzontem · koniec 29 sty 2027 · 100 kg"],
  ] as const)("marks in %s a late proposal and a Beyond Horizon one under the need date, with their planned finish (E16-S02, E18-S02, MRP-037, MRP-049)", (locale, late, beyond) => {
    renderProposals([
      buy({ id: "a", needDate: "2026-10-04", plannedFinish: "2026-10-08", lateDays: 4 }),
      buy({ id: "b", needDate: "2026-10-21", plannedFinish: "2027-01-29", lateDays: 100, beyondHorizon: true }),
    ], { locale });

    const [lateRow, beyondRow] = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(lateRow.querySelector("[data-mrp-need-date]")?.textContent).toBe("2026-10-04");
    expect(lateRow.querySelector("[data-mrp-timing=late-supply]")?.textContent).toBe(late);
    expect(lateRow.querySelector("[data-slot=status-badge]")?.getAttribute("data-tone")).toBe("warning");
    expect(beyondRow.querySelector("[data-mrp-need-date]")?.textContent).toBe("2026-10-21");
    expect(beyondRow.querySelector("[data-mrp-timing=beyond-horizon]")?.textContent).toBe(beyond);
    expect(beyondRow.querySelector("[data-mrp-timing=late-supply]")).toBeNull();
  });

  it("asks before accepting, naming the document, material, location, quantity in its base unit, date and run, and creates nothing on Cancel (RUN-004)", async () => {
    renderProposals([buy()]);

    fireEvent.click(screen.getByRole("button", { name: /^Accept the/ }));
    const dialog = within(await screen.findByRole("alertdialog"));
    expect(dialog.getByText("Create a purchase requisition?")).toBeTruthy();
    expect(dialog.getByText(
      "Purchase requisition for 00000031 — Sugar at 00000002 — Plant North: 100 kg, required by 2026-10-05. It records MRP run 00000004. Nothing is created until you confirm.",
    )).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(accept).not.toHaveBeenCalled();
  });

  it("accepts the run and proposal it was rendered with on confirm, and closes", async () => {
    accept.mockResolvedValue({ ok: true, data: {} });
    renderProposals([buy()]);

    fireEvent.click(screen.getByRole("button", { name: /^Accept the/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Create requisition" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(accept).toHaveBeenCalledWith({ run: "00000004", proposal: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" });
  });

  it.each([
    ["en", { code: "MRP_PROPOSAL_STALE", message: "x" }, en.mrp.proposals.errors.MRP_PROPOSAL_STALE],
    ["en", { code: "MRP_PROPOSAL_ACCEPTED", message: "x", params: { document: "00000012", kind: "purchase-requisition" } }, "This proposal has already been accepted: document 00000012."],
    ["pl", { code: "MRP_PROPOSAL_STALE", message: "x" }, pl.mrp.proposals.errors.MRP_PROPOSAL_STALE],
    ["pl", { code: "TENANT_READ_ONLY", message: "x" }, pl.errors.TENANT_READ_ONLY],
    ["pl", { code: "MATERIAL_INACTIVE", message: "x" }, pl.mrp.proposals.errors.MATERIAL_INACTIVE],
    ["pl", { code: "LOCATION_INACTIVE", message: "x" }, pl.mrp.proposals.errors.LOCATION_INACTIVE],
    ["en", { code: "VALIDATION_FAILED", message: "x" }, "The proposal's quantity is more than a requisition can hold."],
  ] as const)("keeps a refusal in the dialog, in the reader's language (%s, %o)", async (locale, error, text) => {
    accept.mockResolvedValue({ ok: false, error });
    renderProposals([buy()], { locale });

    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.click(await screen.findByRole("button", { name: (locale === "en" ? en : pl).mrp.proposals.confirm.confirm }));

    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("keeps an already accepted refusal on screen, and refreshes the page only once its dialog closes (lesson 2026-10-21)", async () => {
    accept.mockResolvedValue({ ok: false, error: { code: "MRP_PROPOSAL_ACCEPTED", message: "x", params: { document: "00000012", kind: "purchase-requisition" } } });
    renderProposals([buy()]);

    fireEvent.click(screen.getByRole("button", { name: /^Accept the/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Create requisition" }));
    expect(await screen.findByText("This proposal has already been accepted: document 00000012.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("closes a stale refusal without refreshing, keeping the page the reader was looking at", async () => {
    accept.mockResolvedValue({ ok: false, error: { code: "MRP_PROPOSAL_STALE", message: "x" } });
    renderProposals([buy()]);

    fireEvent.click(screen.getByRole("button", { name: /^Accept the/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Create requisition" }));
    await screen.findByText(en.mrp.proposals.errors.MRP_PROPOSAL_STALE);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers no Accept on a read-only tenant, or for a run from an earlier day, which says to run MRP again (spec Q9, Q13)", () => {
    const { unmount } = renderProposals([buy()], { writable: false });
    expect(document.querySelector("[data-mrp-accept]")).toBeNull();
    expect(screen.queryByText(en.mrp.proposals.earlierDay)).toBeNull();
    unmount();

    renderProposals([buy()], { today: "2026-10-02" });
    expect(document.querySelector("[data-mrp-accept]")).toBeNull();
    expect(screen.getByText(en.mrp.proposals.earlierDay)).toBeTruthy();
  });

  it("says when the pair has no proposals, with no earlier-day note", () => {
    renderProposals([], { today: "2026-10-02" });

    expect(screen.getByText(en.mrp.proposals.empty)).toBeTruthy();
    expect(screen.queryByText(en.mrp.proposals.earlierDay)).toBeNull();
  });

  it("passes the dialog plain strings only (lesson 2026-10-24)", () => {
    const values = (value: unknown): unknown[] => (value && typeof value === "object" ? Object.values(value).flatMap(values) : [value]);
    expect(values(en.mrp.proposals).every((value) => typeof value === "string")).toBe(true);
    expect(values(pl.mrp.proposals).every((value) => typeof value === "string")).toBe(true);
  });

  it("names the BOM and revision a production-order proposal plans through, in EN and PL, and none for a requisition or a row without one (E17-S01, MRP-031)", () => {
    const make = buy({ id: "m", kind: "production-order", executable: false, bom: "00000004", bomRevision: 2 });
    renderProposals([make, buy({ id: "b" }), buy({ id: "o", kind: "production-order", executable: false })]);
    expect([...document.querySelectorAll("[data-mrp-proposal-bom]")].map((line) => line.textContent)).toEqual(["BOM 00000004 / revision 2"]);
    expect(table().getAllByRole("row")[1].textContent).toContain("Production orderBOM 00000004 / revision 2");
    renderProposals([make], { locale: "pl" });
    expect(document.querySelectorAll("[data-mrp-proposal-bom]")[1].textContent).toBe("BOM 00000004 / rewizja 2");
  });

  describe("Why this BOM (E18-S03, UX-020)", () => {
    // Priority 1 needs 6 A with 5 dependable; priority 3 has an inactive component; priority 2 was chosen.
    const fallback = buy({
      id: "f", kind: "production-order", executable: false, quantity: "6.000000", bom: "00000005", bomRevision: 2,
      rejectedBoms: [
        { bom: "00000004", revision: 1, reason: "shortage", shortages: [
          { material: "00000013", required: "6.000000", available: "5.000000", shortage: "1.000000" },
          { material: "00000098", required: "2.000000", available: "0.000000", shortage: "2.000000" },
        ] },
        { bom: "00000007", revision: 3, reason: "inactive-component", materials: ["00000021", "00000099"] },
      ],
    });

    it("explains a fallback behind a closed disclosure: each rejected BOM, its reason and each short component in its own unit", () => {
      renderProposals([fallback, buy({ id: "b" })]);
      const [make, requisition] = table().getAllByRole("row").slice(1);
      expect(requisition.querySelector("[data-mrp-why-bom]")).toBeNull();
      const trigger = within(make).getByRole("button", { name: "Why this BOM (2 rejected)" });
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(make.querySelector("[data-mrp-rejections]")).toBeNull();

      fireEvent.click(trigger);

      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      const rejections = within(make).getByRole("list", { name: "Rejected BOMs" });
      expect([...rejections.querySelectorAll(":scope > li")].map((item) => item.getAttribute("data-mrp-rejection"))).toEqual(["shortage", "inactive-component"]);
      expect(rejections.querySelector(":scope > li")!.firstChild?.textContent).toBe("BOM 00000004 / revision 1 — Component shortage");
      // A component the screen doesn't know shows its code, its quantities without a unit.
      expect([...rejections.querySelectorAll("[data-mrp-shortage]")].map((line) => line.textContent)).toEqual([
        "00000013 Sugar: needs 6 KG, dependable 5 KG, short 1 KG",
        "00000098: needs 2, dependable 0, short 2",
      ]);
      expect(rejections.querySelectorAll(":scope > li")[1].textContent).toBe("BOM 00000007 / revision 3 — Inactive BOM Component: 00000021 Colouring, 00000099");
    });

    it("says it in Polish, with Polish plural forms and quantities", () => {
      renderProposals([buy({ ...fallback, rejectedBoms: [{ bom: "00000004", revision: 1, reason: "shortage", shortages: [{ material: "00000013", required: "6.500000", available: "5.000000", shortage: "1.500000" }] }] })], { locale: "pl" });
      fireEvent.click(screen.getByRole("button", { name: "Dlaczego ten BOM (1 odrzucony)" }));
      expect(document.querySelector("[data-mrp-shortage]")?.textContent).toBe("00000013 Sugar: potrzeba 6,5 KG, pewne 5 KG, brakuje 1,5 KG");
      expect(document.querySelector("[data-mrp-rejections] > li")!.firstChild?.textContent).toBe("BOM 00000004 / rewizja 1 — Brak składnika");
    });
  });
});
