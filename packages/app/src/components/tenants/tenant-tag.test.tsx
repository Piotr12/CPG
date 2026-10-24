import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TENANT_EDGES, TENANT_TAG_COLOURS, TenantTag } from "./tenant-tag";

describe("TenantTag", () => {
  it.each([
    ["test", "TEST", "bg-tenant-test-tag text-tenant-test-tag-foreground"],
    ["prod", "PROD", "bg-tenant-prod-tag text-tenant-prod-tag-foreground"],
    ["global", "GLOBAL", "bg-muted text-muted-foreground"],
  ] as const)("names %s in words, in its tag colours (TEN-011)", (tenant, word, colours) => {
    render(<TenantTag tenant={tenant} id={`tag-${tenant}`} />);

    const tag = screen.getByText(word);
    expect(tag.id).toBe(`tag-${tenant}`);
    expect(tag.dataset.tenantTag).toBe(tenant);
    expect(tag.className).toContain(colours);
    // The Badge's geometry, set in spaced semibold capitals.
    for (const each of ["h-5", "rounded-sm", "text-xs", "font-semibold", "tracking-widest", "uppercase"]) expect(tag.className).toContain(each);
    expect(tag.className).not.toContain("font-medium");
  });

  it("styles the tenant with tenant tokens only: warning never means Test, danger never Prod", () => {
    const classes = [...Object.values(TENANT_TAG_COLOURS), ...Object.values(TENANT_EDGES)].join(" ");
    expect(classes).not.toMatch(/warning|danger|amber|red-|neutral-/);
    expect(TENANT_EDGES).toEqual({ test: "border-tenant-test-edge", prod: "border-tenant-prod-edge" });
  });
});
