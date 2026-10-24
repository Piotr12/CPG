import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { navModel } from "../layout/nav-items";
import { SectionTrail } from "./section-trail";

const mocks = vi.hoisted(() => ({ pathname: "/admin/test/locations" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

const admin = navModel({ role: "admin" }, en.nav);

describe("SectionTrail", () => {
  it("shows the group, then the open page as current", () => {
    mocks.pathname = "/admin/prod/locations";
    render(<SectionTrail model={admin} label="You are here" />);

    const trail = screen.getByRole("navigation", { name: "You are here" });
    expect([...trail.querySelectorAll("li[data-slot=breadcrumb-item]")].map((item) => item.textContent)).toEqual(["Master data", "Locations"]);
    expect(trail.querySelectorAll("[data-slot=breadcrumb-separator]")).toHaveLength(2);
    expect(screen.getByText("Locations").getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Master data").getAttribute("aria-current")).toBeNull();
  });

  it("on a detail page, links the list and shows the record as the current step, in mono", () => {
    mocks.pathname = "/admin/test/production-orders/00000060";
    render(<SectionTrail model={admin} label="You are here" />);

    const trail = screen.getByRole("navigation", { name: "You are here" });
    expect([...trail.querySelectorAll("li[data-slot=breadcrumb-item]")].map((item) => item.textContent)).toEqual([
      "Transactions",
      "Production orders",
      "00000060",
    ]);
    expect(trail.querySelectorAll("[data-slot=breadcrumb-separator]")).toHaveLength(3);
    const list = screen.getByRole("link", { name: "Production orders" });
    expect(list.getAttribute("href")).toBe("/admin/test/production-orders");
    expect(list.dataset.slot).toBe("breadcrumb-link");
    expect(list.getAttribute("aria-current")).toBeNull();
    const record = screen.getByText("00000060");
    expect(record.getAttribute("aria-current")).toBe("page");
    expect(record.className).toContain("font-mono");
    // The group is words, not a link: it has no page of its own.
    expect(screen.getByText("Transactions").closest("a")).toBeNull();
  });

  it("keeps the open list's own step unlinked and in the body face", () => {
    mocks.pathname = "/admin/test/production-orders";
    render(<SectionTrail model={admin} label="You are here" />);
    const page = screen.getByText("Production orders");
    expect(page.closest("a")).toBeNull();
    expect(page.getAttribute("aria-current")).toBe("page");
    expect(page.className).not.toContain("font-mono");
  });

  it("shows a top-level entry alone, on a shared page too", () => {
    mocks.pathname = "/admin/audit";
    render(<SectionTrail model={admin} label="You are here" />);
    expect(screen.getByRole("navigation").textContent).toBe("Global audit");
  });

  it("shows nothing for a page the sidebar doesn't hold", () => {
    mocks.pathname = "/admin/tokens";
    const { container } = render(<SectionTrail model={admin} label="You are here" />);
    expect(container.innerHTML).toBe("");
  });
});
