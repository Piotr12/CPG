import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantSwitch } from "./tenant-switch";

const names = { test: "Test", prod: "Prod" };

describe("TenantSwitch", () => {
  it("on a tenant page, links both tenants to the same section and marks the current one", () => {
    const onNavigate = vi.fn();
    render(
      <TenantSwitch tenant="test" pathname="/admin/test/materials/00000005" isTenantPage label="Tenant: Test" names={names} onChoose={vi.fn()} onNavigate={onNavigate} />,
    );
    const group = screen.getByRole("group", { name: "Tenant: Test" });
    expect(group.dataset.tenantSwitch).toBe("test");
    expect(group.className).toContain("w-full");
    const test = within(group).getByRole("link", { name: "Test" });
    const prod = within(group).getByRole("link", { name: "Prod" });
    expect(test.getAttribute("href")).toBe("/admin/test/materials");
    expect(test.getAttribute("aria-current")).toBe("page");
    expect(test.className).toContain("bg-amber-200");
    // A record ID is tenant-local, so switching lands on the list (TEN-012).
    expect(prod.getAttribute("href")).toBe("/admin/prod/materials");
    expect(prod.getAttribute("aria-current")).toBeNull();

    fireEvent.click(prod);
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("elsewhere, offers both tenants as toggles that re-target the menu, in a compact size", () => {
    const onChoose = vi.fn();
    render(<TenantSwitch tenant="prod" pathname="/admin/users" isTenantPage={false} label="Menu shows: Prod" names={names} onChoose={onChoose} compact />);
    const group = screen.getByRole("group", { name: "Menu shows: Prod" });
    expect(group.className).toContain("w-32");
    const prod = within(group).getByRole("button", { name: "Prod" });
    expect(prod.getAttribute("aria-pressed")).toBe("true");
    expect(prod.className).toContain("bg-neutral-900");
    expect(within(group).queryByRole("link")).toBeNull();

    fireEvent.click(within(group).getByRole("button", { name: "Test" }));
    expect(onChoose).toHaveBeenCalledWith("test");
  });
});
