import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { ForecastsFilter } from "./forecasts-filter";
import { forecastsLabels } from "./labels";

const labels = forecastsLabels(en);
const materials = [
  { value: "00000004", label: "00000004 — Painted side panel" },
  { value: "00000005", label: "00000005 — Cabinet, red" },
];
const locations = [{ value: "00000001", label: "00000001 — Main plant" }];
const filter = (selected: { material?: string; location?: string } = {}) => (
  <ForecastsFilter action="/admin/test/forecasts" labels={labels} materials={materials} locations={locations} selected={selected} />
);

describe("ForecastsFilter", () => {
  it("is a plain GET form to the screen's own path, offering every material and location or all", () => {
    render(filter());

    const form = screen.getByRole("search", { name: "Filter forecasts" }) as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/admin/test/forecasts");
    expect(form.method).toBe("get");
    const material = screen.getByLabelText("Material") as HTMLSelectElement;
    expect(material.name).toBe("material");
    expect(within(material).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All",
      "00000004 — Painted side panel",
      "00000005 — Cabinet, red",
    ]);
    expect((screen.getByLabelText("Location") as HTMLSelectElement).name).toBe("location");
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Clear filter" })).toBeNull();
  });

  it("keeps the chosen material and location selected, and offers to clear the filter", () => {
    render(filter({ material: "00000005", location: "00000001" }));

    expect((screen.getByLabelText("Material") as HTMLSelectElement).value).toBe("00000005");
    expect((screen.getByLabelText("Location") as HTMLSelectElement).value).toBe("00000001");
    expect(screen.getByRole("link", { name: "Clear filter" }).getAttribute("href")).toBe("/admin/test/forecasts");
  });

  it("keeps the list's search and sort through a new filter and through Clear filter (#217)", () => {
    const { container } = render(
      <ForecastsFilter action="/admin/test/forecasts" labels={labels} materials={materials} locations={locations} selected={{ material: "00000005" }}
        keep={{ q: "cabinet", sort: "date", dir: "desc", empty: undefined }} />,
    );

    const hidden = [...container.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map(({ name, value }) => `${name}=${value}`);
    expect(hidden).toEqual(["q=cabinet", "sort=date", "dir=desc"]);
    expect(screen.getByRole("link", { name: "Clear filter" }).getAttribute("href")).toBe("/admin/test/forecasts?q=cabinet&sort=date&dir=desc");
  });

  it("offers to clear a filter on one field alone", () => {
    render(filter({ location: "00000001" }));

    expect((screen.getByLabelText("Material") as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("link", { name: "Clear filter" })).toBeTruthy();
  });
});
