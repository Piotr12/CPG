import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb";

describe("Breadcrumb", () => {
  it("renders a named trail whose last entry is the current page", () => {
    render(
      <Breadcrumb aria-label="Trail" className="bc">
        <BreadcrumbList className="ls">
          <BreadcrumbItem>
            <BreadcrumbLink href="https://example.com/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button">Group</button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbItem>
            <BreadcrumbPage>Here</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    const nav = screen.getByRole("navigation", { name: "Trail" });
    expect(nav.dataset.slot).toBe("breadcrumb");
    expect(nav.querySelector("ol")!.dataset.slot).toBe("breadcrumb-list");
    expect(screen.getByRole("link", { name: "Home" }).dataset.slot).toBe("breadcrumb-link");
    expect(screen.getByRole("button", { name: "Group" }).dataset.slot).toBe("breadcrumb-link");
    const separators = nav.querySelectorAll("[data-slot=breadcrumb-separator]");
    expect(separators[0].querySelector("svg")).not.toBeNull();
    expect(separators[1].textContent).toBe("/");
    expect(nav.querySelector("[data-slot=breadcrumb-ellipsis]")!.textContent).toBe("More");
    const page = screen.getByText("Here");
    expect(page.getAttribute("aria-current")).toBe("page");
    expect(page.closest("li")!.dataset.slot).toBe("breadcrumb-item");
  });
});
