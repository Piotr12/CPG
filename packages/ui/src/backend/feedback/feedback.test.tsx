import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { ErrorMessage } from "./error-message";
import { ErrorSummary } from "./error-summary";
import { LoadingMessage } from "./loading-message";

describe("feedback", () => {
  it("reserves a visible page shell and exposes its busy state while content loads", () => {
    const { container } = render(<LoadingMessage />);
    expect(container.firstElementChild!.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll('[data-slot="skeleton"][aria-hidden="true"]')).toHaveLength(3);
  });

  it("announces an error at once", () => {
    render(<ErrorMessage>{"That didn't work."}</ErrorMessage>);

    expect(screen.getByRole("alert").textContent).toBe("That didn't work.");
  });

  it("takes focus with the errors a page opens with, so a screen reader reads them out unasked", () => {
    render(
      <>
        <input aria-label="Before" autoFocus />
        <ErrorSummary id="filter-errors" className="text-destructive">{"Correct the filters."}</ErrorSummary>
      </>,
    );

    const summary = screen.getByRole("alert");
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toBe("Correct the filters.");
    expect(summary.id).toBe("filter-errors");
    expect(summary.getAttribute("tabindex")).toBe("-1");
    expect(summary.className).toBe("outline-none text-destructive");
  });

  it("shows an empty state's title and, when given, what to do", () => {
    const { rerender, container } = render(<EmptyState title="No users yet" />);
    expect(screen.getByText("No users yet")).toBeTruthy();
    expect(container.firstElementChild!.children).toHaveLength(1);

    rerender(<EmptyState title="No users yet">Create the first one.</EmptyState>);
    expect(screen.getByText("Create the first one.")).toBeTruthy();
  });
});
