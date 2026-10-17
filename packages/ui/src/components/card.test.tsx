import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

describe("Card", () => {
  it("renders every part with its slot and extra classes", () => {
    render(
      <Card className="c">
        <CardHeader className="h">
          <CardTitle className="t">title</CardTitle>
          <CardDescription className="d">description</CardDescription>
          <CardAction className="a">action</CardAction>
        </CardHeader>
        <CardContent className="x">content</CardContent>
        <CardFooter className="f">footer</CardFooter>
      </Card>,
    );

    const parts = {
      title: ["card-title", "t"],
      description: ["card-description", "d"],
      action: ["card-action", "a"],
      content: ["card-content", "x"],
      footer: ["card-footer", "f"],
    };
    for (const [text, [slot, className]] of Object.entries(parts)) {
      const part = screen.getByText(text);
      expect(part.dataset.slot).toBe(slot);
      expect(part.classList).toContain(className);
    }

    const header = screen.getByText("title").parentElement!;
    expect(header.dataset.slot).toBe("card-header");
    expect(header.classList).toContain("h");

    const card = header.parentElement!;
    expect(card.dataset).toMatchObject({ slot: "card", size: "default" });
    expect(card.classList).toContain("c");
  });

  it("supports the small size", () => {
    render(<Card size="sm">small</Card>);

    expect(screen.getByText("small").dataset.size).toBe("sm");
  });
});
