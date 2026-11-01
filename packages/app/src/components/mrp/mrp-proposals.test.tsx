import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MrpPlanView, MrpProposalView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { MrpProposals } from "./mrp-proposals";

const RUN = { id: "00000004", startDate: "2026-10-01" };
const buy = (overrides: Partial<MrpProposalView> = {}): MrpProposalView => ({
  id: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", kind: "purchase-requisition", needDate: "2026-10-05", quantity: "100.000000", plannedStart: "2026-10-03", plannedFinish: "2026-10-05", lateDays: 0, beyondHorizon: false, executable: true, document: null, ...overrides,
});
const plan = (proposals: MrpProposalView[]): MrpPlanView => ({
  material: "00000031", materialDescription: "Sugar", materialActive: true, baseUnit: "kg",
  location: "00000002", locationName: "Plant North", locationActive: true, lowestProjectedBefore: "-100.000000", firstShortageDate: "2026-10-05",
  buckets: [], proposals, exceptions: [],
});
const accept = vi.fn();
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const renderProposals = (proposals: MrpProposalView[], { today = "2026-10-01", writable = true, locale = "en" as "en" | "pl" } = {}) =>
  render(
    <MrpProposals tenant={{ code: "test" }} run={RUN} plan={plan(proposals)} today={today} accept={writable ? accept : undefined} locale={locale} messages={locale === "en" ? en : pl} />,
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
    ["en", "Late: finishes 2026-10-08", "Beyond the horizon: finishes 2027-01-29"],
    ["pl", "Spóźniona: kończy się 2026-10-08", "Poza horyzontem: kończy się 2027-01-29"],
  ] as const)("shows in %s a late proposal's and a Beyond Horizon one's planned finish under the need date (E16-S02, MRP-037, MRP-049)", (locale, late, beyond) => {
    renderProposals([
      buy({ id: "a", needDate: "2026-10-04", plannedFinish: "2026-10-08", lateDays: 4 }),
      buy({ id: "b", needDate: "2026-10-21", plannedFinish: "2027-01-29", lateDays: 100, beyondHorizon: true }),
    ], { locale });

    const [lateRow, beyondRow] = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(lateRow.querySelector("[data-mrp-need-date]")?.textContent).toBe("2026-10-04");
    expect(lateRow.querySelector("[data-mrp-timing=late]")?.textContent).toBe(late);
    expect(beyondRow.querySelector("[data-mrp-need-date]")?.textContent).toBe("2026-10-21");
    expect(beyondRow.querySelector("[data-mrp-timing=beyondHorizon]")?.textContent).toBe(beyond);
    expect(beyondRow.querySelector("[data-mrp-timing=late]")).toBeNull();
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
});
