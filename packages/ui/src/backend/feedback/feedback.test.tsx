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

  it("announces an error at once, as icon + text on the danger tokens", () => {
    render(<ErrorMessage>{"That didn't work."}</ErrorMessage>);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("That didn't work.");
    expect(alert.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "gap-2", "rounded-md", "border", "border-danger-edge", "bg-danger-surface", "p-3", "text-sm", "text-danger"]),
    );
    expect(alert.className).not.toMatch(/\//);
    const icon = alert.querySelector("svg")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.classList).toContain("size-4");
  });

  it("takes focus with the errors a page opens with, so a screen reader reads them out unasked", () => {
    render(<ErrorSummary id="filter-errors" className="text-destructive">{"Correct the filters."}</ErrorSummary>);

    const summary = screen.getByRole("alert");
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toBe("Correct the filters.");
    expect(summary.id).toBe("filter-errors");
    expect(summary.getAttribute("tabindex")).toBe("-1");
    expect(summary.className).toBe("outline-none text-destructive");
  });

  it("leaves focus in a field the reader already chose", () => {
    render(
      <>
        <input aria-label="Record ID" autoFocus />
        <ErrorSummary id="filter-errors">{"Correct the filters."}</ErrorSummary>
      </>,
    );

    expect(document.activeElement).toBe(screen.getByLabelText("Record ID"));
    expect(screen.getByRole("alert").textContent).toBe("Correct the filters.");
  });

  it("shows an empty state's title and, when given, what to do", () => {
    const { rerender, container } = render(<EmptyState title="No users yet" />);
    expect(screen.getByText("No users yet")).toBeTruthy();
    expect(container.firstElementChild!.children).toHaveLength(1);

    expect(screen.getByText("No users yet").className).toBe("text-sm font-medium");

    rerender(<EmptyState title="No users yet">Create the first one.</EmptyState>);
    expect(screen.getByText("Create the first one.").className).toBe("max-w-prose text-sm text-muted-foreground");
  });
});
