import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fillNodes } from "./fill-nodes";

describe("fillNodes", () => {
  it("puts a node where each placeholder stands and keeps the text around it", () => {
    const { container } = render(<p>{fillNodes("Run {command} in {agent}.", { command: <code>cpg-mcp</code>, agent: "Codex" })}</p>);

    expect(container.innerHTML).toBe("<p>Run <code>cpg-mcp</code> in Codex.</p>");
  });

  it("leaves a template without placeholders as it is", () => {
    expect(fillNodes("Plain text.", {})).toEqual(["Plain text."]);
  });
});
