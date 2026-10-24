import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ListSearch, SearchResultLine } from "./list-search";

describe("ListSearch", () => {
  it("is a labelled GET search form for the list's own path, showing the submitted search", () => {
    render(<ListSearch label="Search materials" query="steel" action="/admin/test/materials" submitLabel="Search" />);

    const form = screen.getByRole("search");
    expect(form.getAttribute("action")).toBe("/admin/test/materials");
    expect(form.getAttribute("method")).toBeNull();
    const box = screen.getByRole("searchbox", { name: "Search materials" }) as HTMLInputElement;
    expect(box.name).toBe("q");
    expect(box.value).toBe("steel");
    expect(box.getAttribute("aria-describedby")).toBeNull();
    expect(screen.getByRole("button", { name: "Search" }).getAttribute("type")).toBe("submit");
  });

  it("keeps the sort in hidden fields and skips parameters without a value", () => {
    const { container } = render(
      <ListSearch label="Search" action="/list" submitLabel="Search" keep={{ sort: "description", dir: "desc", location: undefined }} />,
    );

    const hidden = [...container.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((input) => `${input.name}=${input.value}`);
    expect(hidden).toEqual(["sort=description", "dir=desc"]);
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  });

  it("describes the box by its hint and a refusal, marking it invalid", () => {
    render(<ListSearch label="Search" hint="ID or description" error="Search with at most 5 words." action="/list" submitLabel="Search" />);

    const box = screen.getByRole("searchbox");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe("list-search-hint list-search-error");
    expect(screen.getByText("ID or description").id).toBe("list-search-hint");
    expect(screen.getByText("Search with at most 5 words.").id).toBe("list-search-error");
  });

  it("renders through the given form component", () => {
    const AppForm = ({ children, action }: { children?: ReactNode; action: string }) => (
      <form data-app-form action={action}>
        {children}
      </form>
    );
    const { container } = render(<ListSearch label="Search" action="/list" submitLabel="Search" form={AppForm} />);

    expect(container.querySelector("form[data-app-form]")).not.toBeNull();
  });
});

describe("SearchResultLine", () => {
  it("states the result and links back to the whole list", () => {
    render(
      <SearchResultLine clearHref="/list?sort=description" clearLabel="Clear search">
        5 materials match “steel”
      </SearchResultLine>,
    );

    expect(screen.getByRole("status").textContent).toBe("5 materials match “steel” · Clear search");
    expect(screen.getByRole("link", { name: "Clear search" }).getAttribute("href")).toBe("/list?sort=description");
  });

  it("renders the link through the given link component", () => {
    const AppLink = ({ href, children }: { href: string; children: ReactNode }) => (
      <a data-app-link href={href}>
        {children}
      </a>
    );
    render(
      <SearchResultLine clearHref="/list" clearLabel="Clear search" link={AppLink}>
        1 match
      </SearchResultLine>,
    );

    expect(screen.getByRole("link", { name: "Clear search" }).hasAttribute("data-app-link")).toBe(true);
  });
});
