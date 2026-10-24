import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SEARCH_TOO_LONG_MESSAGE } from "@cpg/core/validators/lists/list-query.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { listLinks } from "./list-params";
import { ListSearchBar, NoSearchResults } from "./list-search-bar";

vi.mock("next/form", () => ({ default: (props: object) => <form data-next-form {...props} /> }));

const defaults = { sort: "id", dir: "asc" } as const;
const links = (search: string) => listLinks({ path: "/admin/test/materials", search, sort: { sort: "description", dir: "desc" }, defaults });
const labels = { label: "Search materials", hint: "Matches the ID or the description." };

describe("ListSearchBar", () => {
  it("is the list's labelled search, keeping the sort, without a result line before a search", () => {
    const { container } = render(<ListSearchBar links={links("")} search={{ q: "", typed: "" }} labels={labels} lists={en.lists} locale="en" count={26} />);

    expect(container.querySelector("form[data-next-form]")!.getAttribute("action")).toBe("/admin/test/materials");
    expect(screen.getByRole("searchbox", { name: "Search materials" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    expect([...container.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((input) => input.value)).toEqual(["description", "desc"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says how many rows match in the reader's language, with the way back keeping the sort", () => {
    const { rerender } = render(<ListSearchBar links={links("steel")} search={{ q: "steel", typed: "steel" }} labels={labels} lists={en.lists} locale="en" count={1} />);
    expect(screen.getByRole("status").textContent).toBe("1 result for “steel” · Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/materials?sort=description&dir=desc");

    rerender(<ListSearchBar links={links("stal")} search={{ q: "stal", typed: "stal" }} labels={labels} lists={pl.lists} locale="pl" count={3} />);
    expect(screen.getByRole("status").textContent).toBe("3 wyniki dla „stal” · Wyczyść wyszukiwanie");
  });

  it("shows a refused search in the box with the translated reason, and no result line", () => {
    const typed = "a b c d e f";
    render(<ListSearchBar links={links("")} search={{ q: "", typed, error: SEARCH_TOO_LONG_MESSAGE }} labels={labels} lists={pl.lists} locale="pl" count={26} />);

    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(typed);
    expect(screen.getByText("Wyszukuj najwyżej 5 słowami i 100 znakami.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("passes an unknown refusal through", () => {
    render(<ListSearchBar links={links("")} search={{ q: "", typed: "x", error: "Something else." }} labels={labels} lists={en.lists} locale="en" count={0} />);
    expect(screen.getByText("Something else.")).toBeTruthy();
  });
});

describe("NoSearchResults", () => {
  it("says nothing matched and links back to the whole list", () => {
    render(<p><NoSearchResults links={links("brass")} query="brass" lists={en.lists} /></p>);

    expect(screen.getByText(/Nothing matches/).textContent).toBe("Nothing matches “brass”. Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/admin/test/materials?sort=description&dir=desc");
  });
});
