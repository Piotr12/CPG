import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DownloadButtons } from "./download-buttons";

describe("DownloadButtons", () => {
  it("links the package archive by its name and the skill zip, as downloads styled as outline buttons", () => {
    render(<DownloadButtons mcpFileName="cpg-mcp-0123456789ab.zip" labels={{ downloadMcp: "Server", downloadSkill: "Skill" }} />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("data-download")])).toEqual([
      ["Server", "/downloads/cpg-mcp-0123456789ab.zip", "mcp"],
      ["Skill", "/downloads/cpg-onboarding-skill.zip", "skill"],
    ]);
    expect(links.every((link) => link.hasAttribute("download") && link.getAttribute("data-variant") === "outline")).toBe(true);
    expect(links.every((link) => link.querySelector("svg")?.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});
