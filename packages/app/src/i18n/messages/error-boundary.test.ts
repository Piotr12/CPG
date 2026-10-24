import { describe, expect, it } from "vitest";
import { fill } from "../fill";
import { en } from "./en";
import { ERROR_BOUNDARY } from "./error-boundary";
import { pl } from "./pl";

describe("ERROR_BOUNDARY", () => {
  it("says what happened and what to do, quoting the reference, in English", () => {
    expect(ERROR_BOUNDARY.en.title).toBe("Something went wrong on our side.");
    expect(fill(ERROR_BOUNDARY.en.description, { digest: "abc123" })).toBe(
      "Try again; if it keeps happening, tell your administrator and quote reference abc123.",
    );
    expect(ERROR_BOUNDARY.en.retry).toBe("Try again");
  });

  it("says the same in Polish, keeping the reference placeholder", () => {
    expect(ERROR_BOUNDARY.pl.title).toBe("Coś poszło nie tak po naszej stronie.");
    expect(fill(ERROR_BOUNDARY.pl.description, { digest: "abc123" })).toBe(
      "Spróbuj ponownie; jeśli błąd się powtarza, powiedz o tym administratorowi i podaj identyfikator abc123.",
    );
    expect(ERROR_BOUNDARY.pl.retry).toBe("Spróbuj ponownie");
  });

  it("is the dictionaries' unexpectedError, defined once", () => {
    expect(en.unexpectedError).toBe(ERROR_BOUNDARY.en);
    expect(pl.unexpectedError).toBe(ERROR_BOUNDARY.pl);
  });
});
