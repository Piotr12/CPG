import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TenantChoiceCard } from "./tenant-choice-card";

describe("TenantChoiceCard", () => {
  it.each([
    ["test", "Test", "TEST", "border-tenant-test-edge"],
    ["prod", "Prod", "PROD", "border-tenant-prod-edge"],
  ] as const)("links to %s as a plain card with the tenant's edge and tag", (tenant, name, word, edge) => {
    render(
      <TenantChoiceCard tenant={tenant} href={`/admin/${tenant}`} name={name}>
        <span>Open {name}</span>
      </TenantChoiceCard>,
    );

    const card = screen.getByRole("link");
    expect(card.getAttribute("href")).toBe(`/admin/${tenant}`);
    expect(card.dataset.tenantChoice).toBe(tenant);
    expect(card.textContent).toBe(`${name}${word}Open ${name}`);
    expect(card.className).toContain(edge);
    // Shown by edge and tag, never by tinting the card; hover changes the background, never the elevation.
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("hover:bg-muted");
    expect(card.className).toContain("rounded-lg");
    expect(card.className).toContain("p-4");
    expect(card.className).not.toMatch(/shadow|tenant-\w+-tag/);
    expect(screen.getByText(word).dataset.tenantTag).toBe(tenant);
  });
});
