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
    render(<AuditTable entries={[entry({})]} label="Global audit" labels={en.audit} />);

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
        labels={en.audit}
      />,
    );

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["username: alice", "active: yes"]);
  });

  it("says a password reset was not recorded, and never shows a value for it (AUD-015)", () => {
    render(
      <AuditTable
        entries={[entry({ action: "users.user.password-reset", before: null, after: null })]}
        label="Global audit"
        labels={en.audit}
      />,
    );

    expect(cells(rows()[0]).slice(4)).toEqual(["Password reset", "alice", "Password replaced (not recorded)"]);
  });

  it("names the token of an API change and shows no session for it (AUD-007)", () => {
    render(
      <AuditTable
        entries={[entry({ channel: "api", sessionId: null, token: { id: "t-1", name: "robot-a" } })]}
        label="Global audit"
        labels={en.audit}
      />,
    );

    expect(cells(rows()[0]).slice(2, 4)).toEqual(["—", "APIrobot-a"]);
  });

  it("shows an action it has no name for as its ID", () => {
    render(<AuditTable entries={[entry({ action: "tenants.tenant.reset" })]} label="Global audit" labels={en.audit} />);

    expect(screen.getByText("tenants.tenant.reset")).toBeTruthy();
  });

  it("names a read-only flag change, with its before and after (AUD-016)", () => {
    const change = entry({
      action: "tenants.tenant.read-only-changed",
      subject: { type: "Tenant", id: "prod", label: "Prod" },
      before: { readOnly: false },
      after: { readOnly: true },
    });
    render(<AuditTable entries={[change]} label="Global audit" labels={en.audit} />);

    expect(screen.getByText("Read-only flag changed")).toBeTruthy();
    expect(screen.getByRole("row", { name: /Read-only flag changed/ }).textContent).toMatch(/read-only: no → yes/);
  });

  it("offers no way to change an entry (AUD-009)", () => {
    render(<AuditTable entries={[entry({})]} label="Global audit" labels={en.audit} />);

    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryAllByRole("link")).toEqual([]);
    expect(screen.queryAllByRole("textbox")).toEqual([]);
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
        labels={pl.audit}
      />,
    );

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "język: angielski → polski",
      "motyw: jasny → ciemny",
      "note: x → y",
    ]);
  });

  it("says when nothing has been recorded, in the reader's language", () => {
    render(<AuditTable entries={[]} label="Audyt globalny" labels={pl.audit} />);

    expect(screen.getByText("Nic jeszcze nie zapisano.")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Czas (UTC)" })).toBeTruthy();
  });
  it("names stock movements and their stored context in Polish", () => {
    render(<AuditTable entries={[entry({ action: "stock.movement.posted", before: { quantity: "2.000000" }, after: { quantity: "1.000000", movement: "-1.000000", postingId: "posting-1", type: "correction", businessDate: "2026-10-20", reason: "Spis", enteredQuantity: "-1.000000", enteredUnit: "each" } })]} label="Audyt" labels={pl.audit} />);
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
    ]} label="Audit" labels={labels} />);
    expect(screen.getByText(created)).toBeTruthy();
    expect(screen.getByText(updated)).toBeTruthy();
    expect(within(rows()[0]).getAllByRole("listitem").map((item) => item.textContent)).toEqual(changes);
    expect(within(rows()[1]).getByRole("listitem").textContent).toBe(labels.fields.status + ": " + labels.values.status.open + " → " + labels.values.status.completed);
  });

});
