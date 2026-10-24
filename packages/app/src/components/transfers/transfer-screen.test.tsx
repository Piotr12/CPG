import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TransferDetailView, TransferView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { TransferScreen } from "./transfer-screen";
import { listLinks } from "../lists/list-params";
import { TransfersScreen } from "./transfers-screen";

vi.mock("../../app/admin/[tenant]/transfers/[id]/actions", () => ({ cancelTransfer: vi.fn(), closeEarlyTransfer: vi.fn(), dispatchTransfer: vi.fn(), receiveTransfer: vi.fn(),
  writeOffTransfer: vi.fn(), setTransferDates: vi.fn(), reverseTransferPosting: vi.fn() }));
vi.mock("../../app/admin/[tenant]/transfers/actions", () => ({ createTransfer: vi.fn() }));

const material = { id: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 } as const;
const location = (id: string, name: string) => ({ id, name, active: true, createdAt: new Date(), version: 1 });
const locations = [location("00000001", "Main plant"), location("00000002", "Warehouse")];
const leg = (place: string, at: string | null, quantity: string, after: string) => ({ place, location: at, quantity, before: "0.000000", after });
const dispatch = { id: "d1", kind: "dispatch", businessDate: "2027-03-02", occurredAt: new Date("2027-03-02T09:00:00Z"), quantity: "60.000000", enteredQuantity: "60", enteredUnit: "kg",
  numerator: "1", denominator: "1", reason: "Dispatch", actorUsername: "alice", channel: "ui", legs: [leg("source", "00000001", "-60.000000", "40.000000"), leg("transit", null, "60.000000", "60.000000")],
  reversedBy: null, canReverse: false };
const base = {
  id: "00000001", material: material.id, source: "00000001", destination: "00000002", quantity: "100.000000", enteredQuantity: "100", enteredUnit: "kg", numerator: "1", denominator: "1",
  plannedDispatch: "2027-03-01", plannedArrival: "2027-03-03", dispatched: "60.000000", received: "0.000000", abandoned: "0.000000", outstanding: "100.000000", writtenOff: "0.000000",
  inTransit: "60.000000", undispatched: "40.000000", status: "open", createdAt: new Date(), updatedAt: new Date(), version: 3,
};
const transfer = { ...base, postings: [dispatch], reversals: [] } as unknown as TransferDetailView;
const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const props = { tenant, transfer, materials: [material], locations, units: ["kg"], locale: "en" as const, messages: en };
const header = () => screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
const badge = (scope: HTMLElement, label: string) => within(scope).getByText(label).closest("[data-slot=status-badge]");

describe("TransferScreen", () => {
  it("puts the postings, Change dates and Close transfer early… in the header, with one solid action and the status badge", () => {
    render(<TransferScreen {...props} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Transfer 00000001 — 00000001 Steel sheet");
    expect(badge(header(), "Open")?.getAttribute("data-tone")).toBe("neutral");
    const buttons = within(header()).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Dispatch", "Receive", "Write off", en.transfers.editDates.open, "Close transfer early…"]);
    expect(buttons.map((button) => button.getAttribute("data-variant"))).toEqual(["default", "outline", "outline", "outline", "destructive"]);
    expect(screen.getByRole("link", { name: "All transfers" }).getAttribute("href")).toBe("/admin/test/transfers");
    const ledger = within(screen.getByRole("table", { name: en.transfers.ledger.heading })).getAllByRole("cell");
    expect(ledger[3].textContent).toBe("-60 kg"); expect(ledger[3].className).toContain("tabular-nums");
  });

  it("offers nothing on a finished transfer and reads its state in Polish", () => {
    render(<TransferScreen {...props} messages={pl} locale="pl" transfer={{ ...transfer, status: "completed" } as TransferDetailView} />);
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(badge(header(), pl.transfers.status.completed)?.getAttribute("data-tone")).toBe("success");
  });
});

describe("TransfersScreen", () => {
  const row = (id: string, status: string) => ({ ...base, id, status }) as unknown as TransferView;
  const list = { tenant, transfers: [row("00000001", "open"), row("00000002", "closed-early"), row("00000003", "cancelled")], page: 1, total: 3,
    list: { search: { q: "", typed: "" }, sort: { sort: "id" as const, dir: "asc" as const },
      links: listLinks({ path: "/admin/test/transfers", search: "", sort: { sort: "id", dir: "asc" }, defaults: { sort: "id", dir: "asc" } }) },
    materials: [material], locations, units: {}, locale: "en" as const, messages: en };

  it("heads the list with Create transfer and badges Open, Closed Early and Cancelled apart by tone and icon", () => {
    render(<TransfersScreen {...list} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Transfers — Test");
    expect(within(header()).getByText(en.transfers.intro)).toBeTruthy();
    expect(within(header()).getByRole("button", { name: en.transfers.create.open })).toBeTruthy();
    const rows = within(screen.getByRole("table", { name: en.transfers.link })).getAllByRole("row").slice(1);
    expect([["Open", "neutral", "circle-dot"], ["Closed Early", "warning", "circle-minus"], ["Cancelled", "neutral", "circle-x"]].map(([label], index) => {
      const status = badge(rows[index], label)!;
      return [label, status.getAttribute("data-tone"), status.querySelector("svg")?.getAttribute("class")?.match(/lucide-(circle-[a-z]+)/)?.[1]];
    })).toEqual([["Open", "neutral", "circle-dot"], ["Closed Early", "warning", "circle-minus"], ["Cancelled", "neutral", "circle-x"]]);
    const cells = within(rows[0]).getAllByRole("cell");
    expect(cells[0].className).toContain("font-mono"); expect(cells[2].className).toContain("hidden md:table-cell"); expect(cells[7].className).toContain("hidden lg:table-cell");
  });

  it("offers no create action in a read-only tenant", () => {
    render(<TransfersScreen {...list} tenant={{ ...tenant, readOnly: true }} />);
    expect(within(header()).queryByRole("button")).toBeNull();
  });
});
