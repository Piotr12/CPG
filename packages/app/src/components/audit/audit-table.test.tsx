import { render, screen, within } from "@testing-library/react";
import type { AuditEntryView } from "@cpg/core";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { AuditTable } from "./audit-table";

const entry = (overrides: Partial<AuditEntryView>): AuditEntryView => ({
  id: "e-1",
  occurredAt: new Date("2026-10-19T10:30:12.345Z"),
  action: "users.user.deactivated",
  subject: { type: "User", id: "u-2", label: "alice" },
  before: { active: true },
  after: { active: false },
  actor: { userId: "u-1", username: "admin" },
  sessionId: "c41e08b6-1111-4222-8333-444455556666",
  channel: "ui",
  token: null,
  ...overrides,
});

const rows = () => screen.getAllByRole("row").slice(1);
const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent);

describe("AuditTable", () => {
  it("shows time in UTC, account, a short session id, channel, action, subject and changes", () => {
    render(<AuditTable entries={[entry({})]} label="Global audit" path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit} />);

    expect(screen.getByRole("table", { name: "Global audit" })).toBeTruthy();
    expect(cells(rows()[0])).toEqual([
      "2026-10-19 10:30:12",
      "admin",
      "c41e08b6",
      "UI",
      "User deactivated",
      "alice",
      "active: yes → no",
    ]);
    expect(screen.getByTitle("c41e08b6-1111-4222-8333-444455556666")).toBeTruthy();
  });

  it("lists a create's values, one per line", () => {
    render(
      <AuditTable
        entries={[entry({ action: "users.user.created", before: null, after: { username: "alice", active: true } })]}
        label="Global audit"
        path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit}
      />,
    );

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["username: alice", "active: yes"]);
  });

  it("says a password reset was not recorded, and never shows a value for it (AUD-015)", () => {
    render(
      <AuditTable
        entries={[entry({ action: "users.user.password-reset", before: null, after: null })]}
        label="Global audit"
        path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit}
      />,
    );

    expect(cells(rows()[0]).slice(4)).toEqual(["Password reset", "alice", "Password replaced (not recorded)"]);
  });

  it("names the token of an API change and shows no session for it (AUD-007)", () => {
    render(
      <AuditTable
        entries={[entry({ channel: "api", sessionId: null, token: { id: "t-1", name: "robot-a" } })]}
        label="Global audit"
        path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit}
      />,
    );

    expect(cells(rows()[0]).slice(2, 4)).toEqual(["—", "APIrobot-a"]);
  });

  it("shows an action it has no name for as its ID", () => {
    render(<AuditTable entries={[entry({ action: "future.entity.changed" })]} label="Global audit" path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit} />);

    expect(screen.getByText("future.entity.changed")).toBeTruthy();
  });

  it("names a read-only flag change, with its before and after (AUD-016)", () => {
    const change = entry({
      action: "tenants.tenant.read-only-changed",
      subject: { type: "Tenant", id: "prod", label: "Prod" },
      before: { readOnly: false },
      after: { readOnly: true },
    });
    render(<AuditTable entries={[change]} label="Global audit" path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit} />);

    expect(screen.getByText("Read-only flag changed")).toBeTruthy();
    expect(screen.getByRole("row", { name: /Read-only flag changed/ }).textContent).toMatch(/read-only: no → yes/);
  });

  it("names a Test reset's dataset in the reader's language", () => {
    const reset = entry({
      action: "tenants.tenant.reset",
      subject: { type: "Tenant", id: "test", label: "Test" },
      before: { generation: 3, readOnly: false },
      after: { generation: 4, readOnly: false, dataset: "realistic" },
    });
    const { unmount } = render(<AuditTable entries={[reset]} label="Global audit" path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit} />);
    expect(screen.getAllByRole("row")[1].textContent).toMatch(/dataset: [^;]*realistic/);
    unmount();
    render(<AuditTable entries={[reset]} label="Audyt globalny" path="/admin/audit" reversals={[]} empty={pl.audit.empty} labels={pl.audit} />);
    expect(screen.getAllByRole("row")[1].textContent).toMatch(/zbiór danych: [^;]*realistyczny/);
  });

  it("offers no way to change an entry, only its record's history (AUD-009)", () => {
    render(<AuditTable entries={[entry({})]} label="Global audit" path="/admin/audit" reversals={[]} empty={en.audit.empty} labels={en.audit} />);

    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/admin/audit?subjectType=User&subjectId=u-2"]);
  });

  it("names fields and known values in the reader's language, and others as stored", () => {
    render(
      <AuditTable
        entries={[
          entry({
            action: "preferences.user-preference.updated",
            before: { locale: "en", theme: "light", note: "x" },
            after: { locale: "pl", theme: "dark", note: "y" },
          }),
        ]}
        label="Audyt globalny"
        path="/admin/audit" reversals={[]} empty={pl.audit.empty} labels={pl.audit}
      />,
    );

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "język: angielski → polski",
      "motyw: jasny → ciemny",
      "note: x → y",
    ]);
  });

  it("says when nothing has been recorded, in the reader's language", () => {
    render(<AuditTable entries={[]} label="Audyt globalny" path="/admin/audit" reversals={[]} empty={pl.audit.empty} labels={pl.audit} />);

    expect(screen.getByText("Nic jeszcze nie zapisano.")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Czas (UTC)" })).toBeTruthy();
  });
  it("names stock movements and their stored context in Polish", () => {
    render(<AuditTable entries={[entry({ action: "stock.movement.posted", before: { quantity: "2.000000" }, after: { quantity: "1.000000", movement: "-1.000000", postingId: "posting-1", type: "correction", businessDate: "2026-10-20", reason: "Spis", enteredQuantity: "-1.000000", enteredUnit: "each" } })]} label="Audyt" path="/admin/audit" reversals={[]} empty={pl.audit.empty} labels={pl.audit} />);
    expect(screen.getByText("Zaksięgowano ruch zapasu")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "ilość: 2.000000 → 1.000000", "ruch: — → -1.000000", "ID księgowania: — → posting-1", "typ: — → korekta", "data księgowania: — → 2026-10-20", "powód: — → Spis", "wprowadzona ilość: — → -1.000000", "wprowadzona jednostka: — → each",
    ]);
  });
  it.each([
    [en.audit, "Customer order created", "Customer order changed", ["customer: ACME", "lines: []", "status: open"]],
    [pl.audit, "Utworzono zamówienie klienta", "Zmieniono zamówienie klienta", ["klient: ACME", "pozycje: []", "stan: otwarte"]],
  ])("names customer-order actions, fields and status in the reader's language", (labels, created, updated, changes) => {
    render(<AuditTable entries={[
      entry({ action: "customer-orders.customer-order.created", before: null, after: { customer: "ACME", lines: "[]", status: "open" } }),
      entry({ action: "customer-orders.customer-order.updated", before: { status: "open" }, after: { status: "completed" } }),
    ]} label="Audit" path="/admin/audit" reversals={[]} empty={labels.empty} labels={labels} />);
    expect(screen.getByText(created)).toBeTruthy();
    expect(screen.getByText(updated)).toBeTruthy();
    expect(within(rows()[0]).getAllByRole("listitem").map((item) => item.textContent)).toEqual(changes);
    expect(within(rows()[1]).getByRole("listitem").textContent).toBe(labels.fields.status + ": " + labels.values.status.open + " → " + labels.values.status.completed);
  });

  describe("tracing history (E13-S03)", () => {
    const table = (entries: AuditEntryView[], reversals: { original: string; inverse: string }[] = [], labels = en.audit) =>
      render(<AuditTable entries={entries} label="Audit" path="/admin/test/audit" reversals={reversals} empty="None match." labels={labels} />);
    const ORIGINAL = "04f49ff9-3cb6-4583-be90-b89287794b08";
    const INVERSE = "264846a6-a50c-4ac8-9945-ee427f810aff";
    const movement = (id: string, overrides: Partial<AuditEntryView> = {}) =>
      entry({ id, action: "stock.movement.posted", subject: { type: "StockMovement", id, label: "00000001 — Bolts at 00000001 — Plant" },
        before: { quantity: "0.000000" }, after: { quantity: "25.000000", businessDate: "2026-10-21", reason: "Count" }, ...overrides });

    it("opens a record's history from its subject, named for screen readers", () => {
      table([entry({ subject: { type: "PurchaseOrder", id: "00000012", label: "00000012 — 00000003 Steelworks" } })]);

      const link = screen.getByRole("link", { name: "History of 00000012 — 00000003 Steelworks" });
      expect(link.getAttribute("href")).toBe("/admin/test/audit?subjectType=PurchaseOrder&subjectId=00000012");
      expect(link.textContent).toBe("00000012 — 00000003 Steelworks");
    });

    it("shows the business date beneath the audit timestamp only when the entry recorded one (AUD-030)", () => {
      table([movement(ORIGINAL), entry({ id: "e-2" })]);

      expect(cells(rows()[0])[0]).toBe("2026-10-19 10:30:12Business date 2026-10-21");
      expect(cells(rows()[1])[0]).toBe("2026-10-19 10:30:12");
    });

    it("links an original movement and its reversal both ways, next to the reason (AUD-004, REV-020)", () => {
      const link = { original: ORIGINAL, inverse: INVERSE };
      table([movement(INVERSE, { after: { quantity: "0.000000", reason: "Wrong bin", type: "reversal" } }), movement(ORIGINAL)], [link]);

      const [inverseRow, originalRow] = rows();
      expect(within(inverseRow).getByText(/Reverses/).textContent).toBe("Reverses 04f49ff9");
      expect(within(inverseRow).getByRole("link", { name: "04f49ff9" }).getAttribute("href")).toBe(`/admin/test/audit?subjectType=StockMovement&subjectId=${ORIGINAL}`);
      expect(within(inverseRow).getByText("reason: — → Wrong bin")).toBeTruthy();
      expect(within(inverseRow).getByText("type: — → reversal")).toBeTruthy();
      expect(within(originalRow).getByText(/Reversed by/).textContent).toBe("Reversed by 264846a6");
      expect(within(originalRow).getByRole("link", { name: "264846a6" }).getAttribute("title")).toBe(INVERSE);
      expect(within(originalRow).queryByText(/Reverses/)).toBeNull();
    });

    it("shows no reversal link for an unreversed movement or another record type", () => {
      table([movement(ORIGINAL), entry({ id: "e-2", subject: { type: "Material", id: ORIGINAL, label: "Odd" } })], [{ original: "other", inverse: "another" }]);

      expect(screen.queryByText(/Reverse/)).toBeNull();
    });

    it("says when no entry matches the filters", () => {
      table([]);

      expect(screen.getByText("None match.")).toBeTruthy();
    });

    it.each([
      [en.audit, ["line 2: status: open → completed", "line 1: extra component: no", "line 1: fulfilled quantity: — → 5"]],
      [pl.audit, ["pozycja 2: stan: otwarta → zrealizowana", "pozycja 1: składnik dodatkowy: nie", "pozycja 1: ilość zrealizowana: — → 5"]],
    ])("names per-line fields and their values in the reader's language", (labels, expected) => {
      table([entry({ action: "customer-orders.customer-order.fulfilled", before: { line2Status: "open" }, after: { line2Status: "completed", line1Fulfilled: "5" } }),
        entry({ id: "e-2", action: "production-orders.production-completion.posted", before: null, after: { line1Extra: false } })], [], labels);

      expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([expected[0], expected[2], expected[1]]);
    });

    it("keeps an unknown per-line field's name as stored", () => {
      table([entry({ before: null, after: { line3Mystery: "x" } })]);

      expect(screen.getByRole("listitem").textContent).toBe("line 3: mystery: x");
    });

    it("translates the transfer actions and reversal context, leaving recorded values unchanged (UX-022)", () => {
      table([
        entry({ action: "transfers.transfer.dispatched", before: { dispatched: "0.000000" }, after: { dispatched: "4.000000", type: "transfer-dispatch", businessDate: "2026-10-21" } }),
        movement(ORIGINAL, { action: "stock.movement.reversed", before: { reversed: false, balance: "525.000000" }, after: { reversed: true, balance: "500.000000", reason: "Counted the wrong bin" } }),
      ], [], pl.audit);

      expect(screen.getByText("Przesunięcie wydane")).toBeTruthy();
      expect(screen.getByText("ilość wydana: 0.000000 → 4.000000")).toBeTruthy();
      expect(screen.getByText("typ: — → wydanie przesunięcia")).toBeTruthy();
      expect(screen.getByText("odwrócony: nie → tak")).toBeTruthy();
      expect(screen.getByText("stan zapasu: 525.000000 → 500.000000")).toBeTruthy();
      expect(screen.getByText("powód: — → Counted the wrong bin")).toBeTruthy();
      expect(cells(rows()[0])[0]).toBe("2026-10-19 10:30:12Data księgowania 2026-10-21");
      expect(cells(rows()[1])[0]).toBe("2026-10-19 10:30:12");
    });

    it.each([
      [en.audit, [
        "reversed: no → yes", "reversal: — → group-1", "movement count: — → 2", "original movement 1: — → m-1", "reversing movement 1: — → i-1", "original movement 2: — → m-2",
        "produced quantity: 65.000000 → 40.000000", "completion: — → 00000002",
        "posting: p-1", "posting kind: write-off", "reversal: r-1",
      ]],
      [pl.audit, [
        "odwrócony: nie → tak", "odwrócenie: — → group-1", "liczba ruchów: — → 2", "ruch pierwotny 1: — → m-1", "ruch odwracający 1: — → i-1", "ruch pierwotny 2: — → m-2",
        "ilość wyprodukowana: 65.000000 → 40.000000", "wykonanie: — → 00000002",
        "księgowanie: p-1", "rodzaj księgowania: odpis", "odwrócenie: r-1",
      ]],
    ])("names every field of a completion reversal and a transfer posting reversal, keeping the recorded IDs (UX-022, #145)", (labels, expected) => {
      table([
        entry({ action: "production-orders.production-completion.reversed", before: { reversed: false }, after: { reversed: true, reversal: "group-1", movements: 2, movement1Original: "m-1", movement1Inverse: "i-1", movement2Original: "m-2" } }),
        entry({ id: "e-2", action: "production-orders.production-order.completion-reversed", before: { produced: "65.000000" }, after: { produced: "40.000000", completion: "00000002" } }),
        entry({ id: "e-3", action: "transfers.transfer.reversed", before: null, after: { posting: "p-1", kind: "write-off", reversal: "r-1" } }),
      ], [], labels);

      expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(expected);
    });
  });
});
