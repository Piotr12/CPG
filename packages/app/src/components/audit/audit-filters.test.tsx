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
    expect(screen.getByText("Choose the record type, then type its ID (such as 00000012), or use a Subject link")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Record ID").getAttribute("aria-describedby")).toBe("audit-subject-id-hint");
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

  it("keeps an account or record type the selects don't list, names it, and sends it back unchanged on Apply", () => {
    form({ subjectType: "User", account: "zoe" });

    const options = (label: string) => within(screen.getByLabelText(label)).getAllByRole("option").map((option) => option.textContent);
    expect(options("Record type").at(-1)).toBe("User (not in the list)");
    expect(options("Account")).toEqual(["All", "admin", "alice", "zoe (not in the list)"]);
    expect([value("Record type"), value("Account")]).toEqual(["User", "zoe"]);
    const sent = new FormData(screen.getByRole("form") as HTMLFormElement);
    expect([sent.get("subjectType"), sent.get("account")]).toEqual(["User", "zoe"]);
  });

  it("keeps a channel the select doesn't offer, so Apply sends it back for the server to refuse again", () => {
    form({ channel: "fax" as never });

    expect(within(screen.getByLabelText("Channel")).getAllByRole("option").map((option) => option.textContent)).toEqual(["All", "UI", "API", "fax (not in the list)"]);
    expect(value("Channel")).toBe("fax");
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("channel")).toBe("fax");
  });

  it("names a record type of the other audit, and shows any other as sent", () => {
    const { unmount } = render(<AuditFilters path="/admin/audit" selected={{ subjectType: "PurchaseOrder" }} accounts={[]} subjectTypes={GLOBAL_SUBJECT_TYPES} labels={en.audit} />);
    expect(screen.getByRole("option", { name: "Purchase order (not in the list)" }).getAttribute("value")).toBe("PurchaseOrder");
    unmount();

    // Letters the schema accepts that name a built-in property, not a record type.
    form({ subjectType: "toString" });
    expect(screen.getByRole("option", { name: "toString (not in the list)" }).getAttribute("value")).toBe("toString");
    expect(value("Record type")).toBe("toString");
  });

  it("adds no option for a value the select already lists", () => {
    form({ subjectType: "PurchaseOrder", account: "alice" });

    expect(within(screen.getByLabelText("Record type")).getAllByRole("option")).toHaveLength(TENANT_SUBJECT_TYPES.length + 1);
    expect(within(screen.getByLabelText("Account")).getAllByRole("option")).toHaveLength(3);
  });

  it("speaks Polish", () => {
    form({ account: "zoe" }, pl.audit);

    expect(screen.getByRole("form", { name: "Filtruj audyt" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "zoe (spoza listy)" })).toBeTruthy();
    expect(within(screen.getByLabelText("Rodzaj rekordu")).getByRole("option", { name: "Ruch zapasu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zastosuj" })).toBeTruthy();
  });
});

describe("refused filters", () => {
  it("marks each refused field, explains it in the reader's language, and keeps the hint (accessibility)", () => {
    render(<AuditFilters path="/admin/audit" selected={{ subjectId: "00000012", from: "2026-10-21", to: "2026-10-01" }} accounts={[]} subjectTypes={GLOBAL_SUBJECT_TYPES} invalid={["subjectId", "to"]} labels={pl.audit} />);

    const alert = screen.getByRole("alert");
    // An alert already in the page at load isn't announced by every screen reader: it takes focus instead.
    expect(document.activeElement).toBe(alert);
    // First in the form, so Tab from the summary reaches the fields to correct.
    expect(screen.getByRole("form").firstElementChild).toBe(alert);
    // An error is icon + text in the danger tone.
    expect(alert.className).toContain("text-danger");
    expect(alert.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(alert.textContent).toContain("Popraw filtry, aby zobaczyć wpisy:");
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([pl.audit.filterForm.errors.subjectId, pl.audit.filterForm.errors.to]);
    expect(screen.getByLabelText("ID rekordu").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("ID rekordu").getAttribute("aria-describedby")).toBe("audit-subject-id-hint audit-filter-errors");
    expect(screen.getByLabelText("Do (UTC)").getAttribute("aria-describedby")).toBe("audit-filter-errors");
    expect(screen.getByLabelText("Od (UTC)").getAttribute("aria-invalid")).toBeNull();
    expect((screen.getByLabelText("ID rekordu") as HTMLInputElement).value).toBe("00000012");
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
