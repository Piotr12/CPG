import { act, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AutocompleteOption } from "./autocomplete";
import { FilterAutocomplete, type FilterAutocompleteProps } from "./filter-autocomplete";

const options: AutocompleteOption[] = [
  { value: "00000001", code: "00000001", name: "Main warehouse" },
  { value: "00000002", code: "00000002", name: "Old yard", detail: "Inactive" },
];
const labels = { results: { other: "{count} results" }, noMatch: "Nothing matches “{text}”.", more: { other: "{count} more" }, refused: "Choose a location from the list." };

function Filter(props: Partial<FilterAutocompleteProps>) {
  return (
    <form role="search">
      <label id="location-label" htmlFor="location">
        Location
      </label>
      <FilterAutocomplete id="location" name="location" options={options} defaultValue="" labels={labels} aria-labelledby="location-label" {...props} />
    </form>
  );
}

const submitted = () => Object.fromEntries(new FormData(screen.getByRole("search") as HTMLFormElement));

describe("FilterAutocomplete", () => {
  it("is an autocomplete once hydrated, submitting the chosen record under its name", () => {
    render(<Filter defaultValue="00000002" emptyLabel="Any" />);

    const combobox = screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement;
    expect(combobox.value).toBe("00000002 — Old yard");
    expect(combobox.placeholder).toBe("Any");
    expect(submitted()).toEqual({ location: "00000002" });

    fireEvent.change(combobox, { target: { value: "main" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /Main warehouse/ }));
    expect(submitted()).toEqual({ location: "00000001" });
  });

  it("submits the empty choice once the field is emptied", () => {
    render(<Filter defaultValue="00000001" emptyLabel="Any" />);

    const combobox = screen.getByRole("combobox", { name: "Location" });
    fireEvent.change(combobox, { target: { value: "" } });
    fireEvent.keyDown(combobox, { key: "Enter" });

    expect(submitted()).toEqual({ location: "" });
  });

  it("hydrates over the server's select, keeping a choice made before hydration", async () => {
    const element = <Filter defaultValue="00000001" placeholder="Type an ID or a name" />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const select = container.querySelector("select")!;
    expect([...select.options].map((option) => option.value)).toEqual(["00000001", "00000002"]);
    select.value = "00000002";

    const root = await act(async () => hydrateRoot(container, element));

    const combobox = screen.getByRole("combobox", { name: "Location" }) as HTMLInputElement;
    expect(container.querySelector("select")).toBeNull();
    expect(combobox.value).toBe("00000002 — Old yard");
    expect(combobox.placeholder).toBe("Type an ID or a name");
    expect(submitted()).toEqual({ location: "00000002" });

    act(() => root.unmount());
    container.remove();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
