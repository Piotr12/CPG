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
    render(<AuditTable entries={[entry({ action: "tokens.api-token.created" })]} label="Global audit" labels={en.audit} />);

    expect(screen.getByText("tokens.api-token.created")).toBeTruthy();
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
});
