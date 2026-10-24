import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantSwitch } from "./tenant-switch";

const names = { test: "Test", prod: "Prod" };
const writable = { test: false, prod: false };
const common = { names, readOnlyLabel: "read-only" };

describe("TenantSwitch", () => {
  it("on a tenant page, links both tenants to the same section and marks the current one", () => {
    const onNavigate = vi.fn();
    render(
      <TenantSwitch tenant="test" pathname="/admin/test/materials/00000005" isTenantPage label="Tenant: Test" {...common} readOnly={writable} onChoose={vi.fn()} onNavigate={onNavigate} />,
    );
    const group = screen.getByRole("group", { name: "Tenant: Test" });
    expect(group.dataset.tenantSwitch).toBe("test");
    expect(group.className).toContain("w-full");
    const test = within(group).getByRole("link", { name: "Test" });
    const prod = within(group).getByRole("link", { name: "Prod" });
    expect(test.getAttribute("href")).toBe("/admin/test/materials");
    expect(test.getAttribute("aria-current")).toBe("page");
    // The pressed side wears the tenant tokens only (TEN-011): tag colours and the edge as an inset ring.
    expect(test.className).toContain("bg-tenant-test-tag text-tenant-test-tag-foreground ring-1 ring-inset ring-tenant-test-edge");
    expect(test.className).toContain("rounded-sm");
    expect(test.textContent).toBe("Test");
    expect(test.getAttribute("aria-label")).toBeNull();
    expect(prod.className).toContain("text-muted-foreground");
    // A record ID is tenant-local, so switching lands on the list (TEN-012).
    expect(prod.getAttribute("href")).toBe("/admin/prod/materials");
    expect(prod.getAttribute("aria-current")).toBeNull();

    fireEvent.click(prod);
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("elsewhere, offers both tenants as toggles that re-target the menu, in a compact size", () => {
    const onChoose = vi.fn();
    render(<TenantSwitch tenant="prod" pathname="/admin/users" isTenantPage={false} label="Menu shows: Prod" {...common} readOnly={writable} onChoose={onChoose} compact />);
    const group = screen.getByRole("group", { name: "Menu shows: Prod" });
    expect(group.className).toContain("w-32");
    const prod = within(group).getByRole("button", { name: "Prod" });
    expect(prod.getAttribute("aria-pressed")).toBe("true");
    expect(prod.className).toContain("bg-tenant-prod-tag text-tenant-prod-tag-foreground border-b-2 border-tenant-prod-edge");
    expect(group.className).toContain("gap-1");
    expect(group.className).toContain("p-1");
    expect(group.className).toContain("font-semibold");
    expect(within(group).queryByRole("link")).toBeNull();

    fireEvent.click(within(group).getByRole("button", { name: "Test" }));
    expect(onChoose).toHaveBeenCalledWith("test");
  });

  it("in the rail, shows one letter per side and keeps the tenant's name as the accessible name", () => {
    render(
      <TenantSwitch tenant="prod" pathname="/admin/prod/materials" isTenantPage label="Tenant: Prod" {...common} readOnly={{ test: false, prod: true }} onChoose={vi.fn()} rail />,
    );
    const group = screen.getByRole("group", { name: "Tenant: Prod" });
    const test = within(group).getByRole("link", { name: "Test" });
    const prod = within(group).getByRole("link", { name: "Prod (read-only)" });
    expect(test.textContent).toBe("T");
    expect(prod.textContent).toBe("P");
    expect(prod.getAttribute("aria-current")).toBe("page");
    // The letters stay at the caption size: no off-scale type in the rail.
    expect(group.className).toContain("text-xs");
    expect(group.innerHTML).not.toMatch(/text-\[/);
  });

  it("shows a lock, and says read-only to screen readers, on a read-only tenant's side only (R05)", () => {
    for (const readOnly of [{ test: false, prod: true }, { test: true, prod: true }, { test: true, prod: false }]) {
      const { unmount } = render(
        <TenantSwitch tenant="test" pathname="/admin/test" isTenantPage label="Tenant: Test" {...common} readOnly={readOnly} onChoose={vi.fn()} />,
      );
      for (const [code, name] of [["test", "Test"], ["prod", "Prod"]] as const) {
        const link = screen.getByRole("link", { name: readOnly[code] ? `${name} (read-only)` : name });
        expect(link.querySelector("[data-read-only]") !== null).toBe(readOnly[code]);
      }
      unmount();
    }
  });
});
