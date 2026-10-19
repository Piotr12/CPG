import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppFooter, FOOTER_SENTENCE } from "./app-footer";

describe("AppFooter", () => {
  it("renders the exact R11 sentence", () => {
    render(<AppFooter />);

    expect(screen.getByRole("contentinfo").textContent).toBe(
      "Caveman Planning Good! Made in Jozefoslaw with Tokens, Coffee and OpenMercato Skills during AITechLeaders training.",
    );
    expect(FOOTER_SENTENCE).toBe(screen.getByRole("contentinfo").textContent);
  });

  it.each([
    ["OpenMercato Skills", "https://github.com/open-mercato/skills"],
    ["AITechLeaders training", "https://www.aitechleaders.pl/"],
  ])("links %s to %s in a new tab", (name, href) => {
    render(<AppFooter />);

    const link = screen.getByRole("link", { name });
    expect(link.getAttribute("href")).toBe(href);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
