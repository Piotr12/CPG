import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import type { AuditFilterQuery } from "@cpg/core/validators/audit/audit-list.schema";
import { AuditView } from "./audit-view";
import { GLOBAL_SUBJECT_TYPES } from "./subject-types";

const view = (nextBefore: string | null, isFirstPage: boolean, withBack = true, selected: AuditFilterQuery = {}) =>
  render(
    <AuditView
      heading="Global audit"
      back={withBack ? { href: "/admin/test", label: "Test" } : undefined}
      intro="Every change to accounts is kept here."
      page={{ entries: [], nextBefore }}
      path="/admin/audit"
      isFirstPage={isFirstPage}
      selected={selected}
      accounts={["admin", "alice"]}
      subjectTypes={GLOBAL_SUBJECT_TYPES}
      labels={en.audit}
    />,
  );
const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

describe("AuditView", () => {
  it("shows the heading, the back link, what the audit holds and its entries", () => {
    view(null, true);

    expect(screen.getByRole("heading", { level: 1, name: "Global audit" })).toBeTruthy();
    expect(href("Test")).toBe("/admin/test");
    expect(screen.getByText("Every change to accounts is kept here.")).toBeTruthy();
    expect(screen.getByRole("table", { name: "Global audit" })).toBeTruthy();
  });

  it("leaves the back link out when the page has none (the Global audit is in the menu)", () => {
    view(null, true, false);

    expect(screen.getByRole("heading", { level: 1, name: "Global audit" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers the filter form, and says nothing about filters until one is applied", () => {
    view(null, true);

    expect(screen.getByRole("form", { name: "Filter the audit" }).getAttribute("action")).toBe("/admin/audit");
    expect(screen.queryByText("Showing entries that match the filters.")).toBeNull();
    expect(screen.getByText("Nothing has been recorded yet.")).toBeTruthy();
  });

  it("says when a filter is applied, and what an empty filtered page means", () => {
    view(null, true, false, { account: "alice" });

    expect(screen.getByText("Showing entries that match the filters.")).toBeTruthy();
    expect(screen.getByText("No entries match these filters.")).toBeTruthy();
    expect(href("Clear filters")).toBe("/admin/audit");
  });

  it("keeps the filters on both paging links", () => {
    view("e-100", false, false, { subjectType: "User", subjectId: "u-2" });

    expect(href("← Newest entries")).toBe("/admin/audit?subjectType=User&subjectId=u-2");
    expect(href("Older entries →")).toBe("/admin/audit?subjectType=User&subjectId=u-2&before=e-100");
  });

  it("has no paging links when everything fits on the first page", () => {
    view(null, true);

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("links to older entries from the first page", () => {
    view("e-50", true);

    expect(href("Older entries →")).toBe("/admin/audit?before=e-50");
    expect(screen.queryByRole("link", { name: "← Newest entries" })).toBeNull();
  });

  it("links back to the newest entries from a later page, and on when there is more", () => {
    view("e-100", false);

    expect(href("← Newest entries")).toBe("/admin/audit");
    expect(href("Older entries →")).toBe("/admin/audit?before=e-100");
  });

  it("links back from the last page", () => {
    view(null, false);

    expect(href("← Newest entries")).toBe("/admin/audit");
    expect(screen.queryByRole("link", { name: "Older entries →" })).toBeNull();
  });
});
