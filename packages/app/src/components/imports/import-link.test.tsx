import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportLink } from "./import-link";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

describe("ImportLink", () => {
  it("leads the admin to the tenant's Import screen", () => {
    render(<ImportLink tenant="prod" label="Import from spreadsheet" />);

    expect(screen.getByRole("link", { name: "Import from spreadsheet" }).getAttribute("href")).toBe("/admin/prod/import");
  });
});
