import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/dialog";
import { FilterMultiSelect, type FilterMultiSelectOption, type FilterMultiSelectProps } from "./filter-multi-select";

const options: FilterMultiSelectOption[] = [
  { value: "00000005", code: "00000005", name: "Cabinet, red", detail: "1 each = 1 SU" },
  { value: "00000018", code: "00000018", name: "Office cabinet, grey", detail: "1 each = 1.2 SU" },
  { value: "00000021", code: "00000021", name: "Workshop cabinet", detail: "No SU factor", inactive: true },
  { value: "00000026", code: "00000026", name: "Key cabinet" },
  { value: "00000030", code: "00000030", name: "Desk, oak" },
  { value: "00000031", code: "00000031", name: "Desk, pine" },
];
const labels = {
  all: "All finished products",
  selected: { one: "{count} selected", other: "{count} selected" },
  search: "Search by ID or name",
  shown: "{shown} of {total}",
  selectShown: "Select shown",
  clear: "Clear",
  noMatch: "Nothing matches “{text}”.",
  more: { other: "+{count} more" },
  remove: "Remove {name}",
  inactive: "(inactive)",
};

function Filter(props: Partial<FilterMultiSelectProps>) {
  return (
    <form role="search">
      <label id="material-label" htmlFor="material">
        Finished products
      </label>
      <FilterMultiSelect id="material" name="material" options={options} defaultValue={[]} labels={labels} aria-labelledby="material-label" {...props} />
    </form>
  );
}

const submitted = () => new FormData(screen.getByRole("search") as HTMLFormElement).getAll("material");
const trigger = () => screen.getByRole("button", { name: /^Finished products/ });
const search = () => screen.getByRole("searchbox", { name: "Search by ID or name" });
const option = (name: RegExp) => screen.getByRole("option", { name });
const shownOptions = () => screen.queryAllByRole("option").map((element) => element.textContent);

function openList() {
  fireEvent.click(trigger());
  return screen.getByRole("listbox", { name: "Finished products" });
}

describe("FilterMultiSelect", () => {
  it("says all while nothing is chosen, and submits nothing", () => {
    render(<Filter />);

    expect(trigger().textContent).toBe("All finished products");
    expect(screen.getByRole("button", { name: "Finished products All finished products" })).toBeTruthy();
    expect(submitted()).toEqual([]);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows the one choice, then the count, and submits each choice under the same name", () => {
    const { unmount } = render(<Filter defaultValue={["00000018"]} />);
    expect(trigger().textContent).toBe("00000018 — Office cabinet, grey");
    expect(submitted()).toEqual(["00000018"]);
    unmount();

    // In the options' order, whatever order the URL had; a value no option has is dropped.
    render(<Filter defaultValue={["00000026", "gone", "00000005"]} locale="pl" />);
    expect(trigger().textContent).toBe("2 selected");
    expect(submitted()).toEqual(["00000005", "00000026"]);
  });

  it("opens a list that can choose several, with each option's detail and inactive marker", () => {
    render(<Filter defaultValue={["00000021"]} />);

    const list = openList();

    expect(list.getAttribute("aria-multiselectable")).toBe("true");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(search());
    expect(screen.getByRole("status").textContent).toBe("6 of 6");
    const workshop = option(/Workshop cabinet/);
    expect(workshop.getAttribute("aria-selected")).toBe("true");
    expect(workshop.textContent).toBe("00000021 — Workshop cabinet (inactive)No SU factor");
    expect(within(workshop).getByText("No SU factor").className).toContain("text-xs");
    expect(option(/Key cabinet/).textContent).toBe("00000026 — Key cabinet");

    fireEvent.click(option(/Cabinet, red/));
    fireEvent.click(workshop);

    expect(option(/Cabinet, red/).getAttribute("aria-selected")).toBe("true");
    expect(workshop.getAttribute("aria-selected")).toBe("false");
    expect(submitted()).toEqual(["00000005"]);
  });

  it("searches the ID and name, counting what it shows, and says when nothing matches", () => {
    render(<Filter />);
    openList();

    fireEvent.change(search(), { target: { value: "cab grey" } });
    expect(shownOptions()).toEqual(["00000018 — Office cabinet, grey1 each = 1.2 SU"]);
    expect(screen.getByRole("status").textContent).toBe("1 of 6");
    expect(option(/Office/).querySelectorAll("mark")).toHaveLength(2);

    fireEvent.change(search(), { target: { value: "0003" } });
    expect(shownOptions()).toEqual(["00000030 — Desk, oak", "00000031 — Desk, pine"]);

    fireEvent.change(search(), { target: { value: " chair " } });
    expect(shownOptions()).toEqual([]);
    expect(screen.getByText("Nothing matches “chair”.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("0 of 6");
    expect((screen.getByRole("button", { name: "Select shown" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("selects every shown option, keeping earlier choices, and clears them all", () => {
    render(<Filter defaultValue={["00000030"]} />);
    openList();

    fireEvent.change(search(), { target: { value: "cabinet" } });
    fireEvent.click(screen.getByRole("button", { name: "Select shown" }));

    expect(submitted()).toEqual(["00000005", "00000018", "00000021", "00000026", "00000030"]);
    expect(trigger().textContent).toBe("5 selected");

    const clear = screen.getByRole("button", { name: "Clear" }) as HTMLButtonElement;
    fireEvent.click(clear);

    expect(submitted()).toEqual([]);
    expect(trigger().textContent).toBe("All finished products");
    expect(clear.disabled).toBe(true);
  });

  it("shows the first four choices as chips and counts the rest", () => {
    render(<Filter defaultValue={options.map((each) => each.value)} />);

    const chips = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "00000005 — Cabinet, red",
      "00000018 — Office cabinet, grey",
      "00000021 — Workshop cabinet",
      "00000026 — Key cabinet",
      "+2 more",
    ]);
  });

  it("removes a choice with its chip's button and gives focus back to the field", () => {
    render(<Filter defaultValue={["00000005", "00000026"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove 00000005 — Cabinet, red" }));

    expect(submitted()).toEqual(["00000026"]);
    expect(within(screen.getByRole("list")).getAllByRole("listitem").map((chip) => chip.textContent)).toEqual(["00000026 — Key cabinet"]);
    expect(document.activeElement).toBe(trigger());
  });

  it("moves through the list with the arrow keys, Home and End, and toggles with Space and Enter", () => {
    render(<Filter />);
    openList();

    fireEvent.keyDown(search(), { key: "ArrowDown" });
    expect(document.activeElement).toBe(option(/Cabinet, red/));
    expect(option(/Cabinet, red/).tabIndex).toBe(0);

    const key = (name: string) => fireEvent.keyDown(document.activeElement!, { key: name });
    key("ArrowDown");
    expect(document.activeElement).toBe(option(/Office/));
    expect(key(" ")).toBe(false);
    expect(option(/Office/).getAttribute("aria-selected")).toBe("true");

    key("End");
    expect(document.activeElement).toBe(option(/pine/));
    key("ArrowDown");
    expect(document.activeElement).toBe(option(/pine/));
    key("Enter");
    key("ArrowUp");
    expect(document.activeElement).toBe(option(/oak/));
    key("Home");
    expect(document.activeElement).toBe(option(/Cabinet, red/));
    key("ArrowUp");
    expect(document.activeElement).toBe(search());

    expect(submitted()).toEqual(["00000018", "00000031"]);
    expect(fireEvent.keyDown(option(/oak/), { key: "a" })).toBe(true);
  });

  it("leaves the search field's keys alone when nothing matches or the key isn't ArrowDown", () => {
    render(<Filter />);
    openList();

    expect(fireEvent.keyDown(search(), { key: "ArrowUp" })).toBe(true);
    fireEvent.change(search(), { target: { value: "chair" } });
    expect(fireEvent.keyDown(search(), { key: "ArrowDown" })).toBe(true);
    expect(document.activeElement).toBe(search());
  });

  it("closes on Escape, giving focus back to the field, and starts the next search afresh", async () => {
    render(<Filter />);
    openList();
    fireEvent.change(search(), { target: { value: "desk" } });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeNull();
    fireEvent.keyDown(search(), { key: "Tab" });
    expect(screen.queryByRole("listbox")).not.toBeNull();

    expect(fireEvent.keyDown(search(), { key: "Escape" })).toBe(false);
    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger()));

    openList();
    expect((search() as HTMLInputElement).value).toBe("");
    expect(shownOptions()).toHaveLength(6);
  });

  it("closes only its list on Escape inside a dialog, and the dialog on the next Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Filter</DialogTitle>
          <DialogDescription>Choose products</DialogDescription>
          <Filter />
        </DialogContent>
      </Dialog>,
    );
    openList();

    fireEvent.keyDown(search(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables the field and its chips", () => {
    render(<Filter defaultValue={["00000005"]} disabled />);

    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^Remove/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is named by its own text without a visible label", () => {
    render(<FilterMultiSelect id="material" name="material" options={options} defaultValue={[]} labels={labels} className="w-64" />);

    const button = screen.getByRole("button", { name: "All finished products" });
    expect(button.getAttribute("aria-labelledby")).toBeNull();
    expect(button.parentElement!.className).toBe("w-64");
  });

  it("starts afresh when remounted with a new key, never reading the previous field", () => {
    const { rerender } = render(<Filter key="00000005" defaultValue={["00000005"]} />);
    openList();
    fireEvent.click(option(/Desk, oak/));
    expect(submitted()).toEqual(["00000005", "00000030"]);

    rerender(<Filter key="" defaultValue={[]} />);

    expect(trigger().textContent).toBe("All finished products");
    expect(submitted()).toEqual([]);
  });

  it("hydrates over the server's select, keeping a choice made before hydration", async () => {
    const element = <Filter defaultValue={["00000005"]} />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const select = container.querySelector("select")!;
    expect(select.multiple).toBe(true);
    expect(select.name).toBe("material");
    expect([...select.selectedOptions].map((each) => each.value)).toEqual(["00000005"]);
    expect(select.options[2].text).toBe("00000021 — Workshop cabinet (No SU factor) (inactive)");
    expect(select.options[3].text).toBe("00000026 — Key cabinet");
    select.options[4].selected = true;
    select.options[5].selected = true;

    const root = await act(async () => hydrateRoot(container, element));

    expect(container.querySelector("select")).toBeNull();
    expect(trigger().textContent).toBe("3 selected");
    expect(submitted()).toEqual(["00000005", "00000030", "00000031"]);

    act(() => root.unmount());
    container.remove();
  });
});
