import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { AuditFilters } from "./audit-filters";
import { GLOBAL_SUBJECT_TYPES, TENANT_SUBJECT_TYPES } from "./subject-types";

const form = (selected = {}, labels = en.audit) =>
  render(<AuditFilters path="/admin/test/audit" selected={selected} accounts={["admin", "alice"]} subjectTypes={TENANT_SUBJECT_TYPES} labels={labels} />);
const value = (name: string) => (screen.getByLabelText(name) as HTMLInputElement | HTMLSelectElement).value;

describe("AuditFilters", () => {
  it("is a GET form to the same screen, with every filter empty by default", () => {
    form();

    const filters = screen.getByRole("form", { name: "Filter the audit" });
    expect(filters.getAttribute("action")).toBe("/admin/test/audit");
    expect(filters.getAttribute("method")).toBeNull();
    expect(["Record type", "Record ID", "Account", "Channel", "From (UTC)", "To (UTC)"].map(value)).toEqual(["", "", "", "", "", ""]);
    expect(screen.getByText("Set by a Subject link, or type an ID such as 00000012")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("names each parameter as the API does", () => {
    form();

    const names = Array.from(screen.getByRole("form").querySelectorAll("[name]")).map((field) => field.getAttribute("name"));
    expect(names).toEqual(["subjectType", "subjectId", "account", "channel", "from", "to"]);
    expect(screen.getByLabelText("From (UTC)").getAttribute("type")).toBe("date");
  });

  it("shows the active filters and a way to clear them", () => {
    form({ subjectType: "PurchaseOrder", subjectId: "00000012", account: "alice", channel: "api", from: "2026-10-01", to: "2026-10-21" });

    expect(["Record type", "Record ID", "Account", "Channel", "From (UTC)", "To (UTC)"].map(value)).toEqual([
      "PurchaseOrder", "00000012", "alice", "api", "2026-10-01", "2026-10-21",
    ]);
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/admin/test/audit");
  });

  it("offers the audit's record types by name, every account, and both channels", () => {
    form();

    const options = (label: string) => within(screen.getByLabelText(label)).getAllByRole("option").map((option) => option.textContent);
    expect(options("Record type")).toEqual(["All", ...TENANT_SUBJECT_TYPES.map((type) => en.audit.subjects[type])]);
    expect(options("Account")).toEqual(["All", "admin", "alice"]);
    expect(options("Channel")).toEqual(["All", "UI", "API"]);
  });

  it("speaks Polish", () => {
    form({}, pl.audit);

    expect(screen.getByRole("form", { name: "Filtruj audyt" })).toBeTruthy();
    expect(within(screen.getByLabelText("Rodzaj rekordu")).getByRole("option", { name: "Ruch magazynowy" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zastosuj" })).toBeTruthy();
  });
});

describe("subject types", () => {
  it("names every record type of either audit in both languages, once", () => {
    const all = [...GLOBAL_SUBJECT_TYPES, ...TENANT_SUBJECT_TYPES];
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(Object.keys(en.audit.subjects).sort());
    for (const type of all) {
      expect(en.audit.subjects[type]).toBeTruthy();
      expect(pl.audit.subjects[type]).toBeTruthy();
    }
  });
});
