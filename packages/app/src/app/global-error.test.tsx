import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

const serverError = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "2913876712" });

describe("GlobalError", () => {
  it("brings its own document, in English, titled", () => {
    const markup = renderToStaticMarkup(<GlobalError error={serverError} retry={vi.fn()} />);

    expect(markup).toMatch(/^<html lang="en">.*<title>Something went wrong · Caveman Planning Good<\/title>.*<body/);
  });

  it("says something went wrong in both languages, English first, quoting the reference, and tries again", () => {
    const retry = vi.fn();
    // React DOM renders <html> and <body> into the test document's own.
    render(<GlobalError error={serverError} retry={retry} />, { container: document });

    const [english, polish] = screen.getByRole("alert").querySelectorAll("p[lang]");
    expect(english.getAttribute("lang")).toBe("en");
    expect(english.textContent).toBe(
      "Something went wrong on our side. Try again; if it keeps happening, tell your administrator and quote reference 2913876712.",
    );
    expect(polish.getAttribute("lang")).toBe("pl");
    expect(polish.textContent).toContain("Coś poszło nie tak po naszej stronie.");
    expect(polish.textContent).toContain("podaj identyfikator 2913876712.");
    fireEvent.click(screen.getByRole("button", { name: "Try again / Spróbuj ponownie" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("quotes a dash when the error has no reference", () => {
    expect(renderToStaticMarkup(<GlobalError error="boom" retry={vi.fn()} />)).toContain("quote reference —.");
  });
});
