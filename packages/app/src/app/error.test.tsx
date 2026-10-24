import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

const serverError = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "2913876712" });

describe("ErrorPage", () => {
  afterEach(() => {
    document.documentElement.lang = "";
  });

  it("says something went wrong, quotes the reference, and tries again on request", () => {
    const retry = vi.fn();
    render(<ErrorPage error={serverError} retry={retry} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Something went wrong on our side.");
    expect(screen.getByRole("alert").textContent).toBe("Try again; if it keeps happening, tell your administrator and quote reference 2913876712.");
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(document.querySelector("main")?.className).toContain("max-w-3xl");
  });

  it("speaks Polish when the page is Polish, with a dash for an error without a reference", () => {
    document.documentElement.lang = "pl";
    render(<ErrorPage error={new Error("client")} retry={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("podaj identyfikator —.");
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
  });

  it("falls back to English for any other language, and on the server", () => {
    document.documentElement.lang = "de";
    render(<ErrorPage error={serverError} retry={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();

    document.documentElement.lang = "pl";
    expect(renderToString(<ErrorPage error={serverError} retry={vi.fn()} />)).toContain('lang="en"');
  });
});
