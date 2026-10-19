import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorMessage } from "./error-message";
import { LoadingMessage } from "./loading-message";

describe("feedback", () => {
  it("announces loading politely, with a default and a custom text", () => {
    const { rerender } = render(<LoadingMessage />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");

    rerender(<LoadingMessage>Caveman count rocks…</LoadingMessage>);
    expect(screen.getByRole("status").textContent).toBe("Caveman count rocks…");
  });

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
