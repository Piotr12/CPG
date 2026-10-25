import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { ForecastsFilter } from "./forecasts-filter";
import { forecastsLabels } from "./labels";

const labels = forecastsLabels(en);
const materials = [
  { id: "00000004", description: "Painted side panel", active: true },
  { id: "00000005", description: "Cabinet, red", active: false },
];
const locations = [{ id: "00000001", name: "Main plant", active: true }];
const filter = (selected: { material?: string; location?: string } = {}, keep?: Record<string, string | undefined>) => (
  <ForecastsFilter action="/admin/test/forecasts" labels={labels} materials={materials} locations={locations} selected={selected} notListed={en.lists.notListed} keep={keep} locale="en" />
);
const submitted = () => [...new FormData(screen.getByRole("search") as HTMLFormElement)].map(([name, value]) => `${name}=${String(value)}`);

describe("ForecastsFilter", () => {
  it("is a plain GET form to the screen's own path, offering every material, inactive ones marked, or all (#222)", () => {
    render(filter());

    const form = screen.getByRole("search", { name: "Filter forecasts" }) as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/admin/test/forecasts");
    expect(form.method).toBe("get");
    const material = screen.getByRole("combobox", { name: "Material" }) as HTMLInputElement;
    expect(material.placeholder).toBe("All");
    fireEvent.focus(material);
    const list = screen.getByRole("listbox", { name: "Material" });
    expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "00000004—Painted side panel",
      "00000005—Cabinet, redInactive",
    ]);
    expect(screen.getByRole("combobox", { name: "Location" })).toBeTruthy();
    expect(submitted()).toEqual(["material=", "location="]);
    expect(screen.getByRole("button", { name: "Filter" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Clear filter" })).toBeNull();
  });

  it("submits the material chosen in the autocomplete, refusing text that matches none", () => {
    render(filter());

    const material = screen.getByRole("combobox", { name: "Material" });
    fireEvent.change(material, { target: { value: "panel" } });
    fireEvent.keyDown(material, { key: "Enter" });
    expect(submitted()).toEqual(["material=00000004", "location="]);

    fireEvent.change(material, { target: { value: "nothing like it" } });
    fireEvent.keyDown(material, { key: "Enter" });
    expect(screen.getByText("Choose a material from the list.")).toBeTruthy();
    expect(submitted()).toEqual(["material=", "location="]);
  });

  it("keeps the chosen material and location, and offers to clear the filter", () => {
    render(filter({ material: "00000005", location: "00000001" }));

    expect((screen.getByRole("combobox", { name: "Material" }) as HTMLInputElement).value).toBe("00000005 — Cabinet, red");
    expect((screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement).value).toBe("00000001 — Main plant");
    expect(submitted()).toEqual(["material=00000005", "location=00000001"]);
    expect(screen.getByRole("link", { name: "Clear filter" }).getAttribute("href")).toBe("/admin/test/forecasts");
  });

  it("shows an address's ID that names no record as its own choice, not in the list (#222)", () => {
    render(filter({ location: "00000099" }));

    expect((screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement).value).toBe("00000099 — not in the list");
    expect(submitted()).toEqual(["material=", "location=00000099"]);
  });

  it("is a native select before hydration, so the form works without JavaScript (#222)", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(filter({ material: "00000004" }));

    const select = container.querySelector<HTMLSelectElement>('form[role="search"] select[name="material"]')!;
    expect(select.value).toBe("00000004");
    expect([...select.options].map((option) => option.textContent)).toEqual(["All", "00000004 — Painted side panel", "00000005 — Cabinet, red (Inactive)"]);
    expect(container.querySelector('select[name="location"]')!.getAttribute("aria-labelledby")).toBe("forecast-filter-location-label");
  });

  it("keeps the list's search and sort through a new filter and through Clear filter (#217)", () => {
    const { container } = render(filter({ material: "00000004" }, { q: "cabinet", sort: "date", dir: "desc", empty: undefined }));

    const hidden = [...container.querySelectorAll<HTMLInputElement>(":scope > form > input[type=hidden]")].map(({ name, value }) => `${name}=${value}`);
    expect(hidden).toEqual(["q=cabinet", "sort=date", "dir=desc"]);
    expect(screen.getByRole("link", { name: "Clear filter" }).getAttribute("href")).toBe("/admin/test/forecasts?q=cabinet&sort=date&dir=desc");
  });

  it("offers to clear a filter on one field alone", () => {
    render(filter({ location: "00000001" }));

    expect((screen.getByRole("combobox", { name: "Material" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("link", { name: "Clear filter" })).toBeTruthy();
  });
});
