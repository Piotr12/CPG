import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorMessage } from "./error-message";

describe("feedback", () => {
  it("announces an error at once", () => {
    render(<ErrorMessage>{"That didn't work."}</ErrorMessage>);

    expect(screen.getByRole("alert").textContent).toBe("That didn't work.");
  });

  it("shows an empty state's title and, when given, what to do", () => {
    const { rerender, container } = render(<EmptyState title="No users yet" />);
    expect(screen.getByText("No users yet")).toBeTruthy();
    expect(container.firstElementChild!.children).toHaveLength(1);

    rerender(<EmptyState title="No users yet">Create the first one.</EmptyState>);
    expect(screen.getByText("Create the first one.")).toBeTruthy();
  });
});
