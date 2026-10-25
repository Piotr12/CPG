import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/dialog";
import { Autocomplete, clipBounds, matchOptions, placeList, type AutocompleteLabels, type AutocompleteOption } from "./autocomplete";

const options: AutocompleteOption[] = [
  { value: "m1", code: "00000001", name: "Steel sheet 2 mm", detail: "kg" },
  { value: "m7", code: "00000007", name: "Steel sheet 1.0 mm", detail: "kg" },
  { value: "m10", code: "00000010", name: "Hinge, steel" },
  { value: "m11", code: "00000011", name: "Cam lock" },
];

const labels: AutocompleteLabels = {
  results: { one: "{count} result", other: "{count} results" },
  noMatch: "Nothing matches “{text}”.",
  more: { one: "{count} more", other: "{count} more" },
  refused: "Choose a material from the list.",
};

/** The autocomplete as a form holds it: the value lives outside. */
function Field({ initial = "", onChange = vi.fn(), limit, name }: { initial?: string; onChange?: (value: string) => void; limit?: number; name?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Autocomplete
        aria-label="Material"
        options={options}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        labels={labels}
        limit={limit}
        name={name}
      />
      <button type="button" onClick={() => setValue("m11")}>
        Reset to cam lock
      </button>
      <button type="button" onClick={() => setValue("")}>
        Clear
      </button>
      <span data-testid="value">{value}</span>
    </>
  );
}

const input = () => screen.getByRole("combobox", { name: "Material" });
const shownOptions = () => screen.queryAllByRole("option").map((option) => option.textContent);
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const key = (name: string) => fireEvent.keyDown(input(), { key: name });

describe("matchOptions", () => {
  it("needs every typed word in the code or the name, ignoring case", () => {
    expect(matchOptions(options, "STEEL sh").map((option) => option.value)).toEqual(["m1", "m7"]);
    expect(matchOptions(options, "0001").map((option) => option.value)).toEqual(["m1", "m10", "m11"]);
    expect(matchOptions(options, "")).toEqual(options);
  });
});

describe("placeList", () => {
  it("opens below, as tall as the room under the field allows, up to 320 px", () => {
    expect(placeList({ top: 100, bottom: 132 }, { top: 0, bottom: 800 })).toEqual({ side: "below", maxHeight: 320 });
    expect(placeList({ top: 500, bottom: 532 }, { top: 300, bottom: 740 })).toEqual({ side: "below", maxHeight: 200 });
  });

  it("opens upward when little room is left below and more above (a field low in a tall dialog)", () => {
    expect(placeList({ top: 560, bottom: 592 }, { top: 168, bottom: 628 })).toEqual({ side: "above", maxHeight: 320 });
    expect(placeList({ top: 300, bottom: 332 }, { top: 100, bottom: 400 })).toEqual({ side: "above", maxHeight: 192 });
  });

  it("stays below when there is no more room above, never with a negative height", () => {
    expect(placeList({ top: 10, bottom: 42 }, { top: 0, bottom: 100 })).toEqual({ side: "below", maxHeight: 50 });
    expect(placeList({ top: 0, bottom: 40 }, { top: 0, bottom: 40 })).toEqual({ side: "below", maxHeight: 0 });
  });
});

describe("clipBounds", () => {
  it("is the nearest ancestor that scrolls, or the viewport", () => {
    const { container } = render(
      <div data-testid="dialog" style={{ overflowY: "auto" }}>
        <div>
          <input data-testid="inside" />
        </div>
      </div>,
    );
    const dialog = screen.getByTestId("dialog");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ top: 168, bottom: 628 } as DOMRect);

    expect(clipBounds(screen.getByTestId("inside"))).toEqual({ top: 168, bottom: 628 });
    const loose = document.createElement("input");
    container.append(loose);
    expect(clipBounds(loose)).toEqual({ top: 0, bottom: window.innerHeight });
  });
});

describe("Autocomplete", () => {
  it("is a closed combobox showing the chosen option's code and name", () => {
    render(<Field initial="m7" />);

    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect((input() as HTMLInputElement).value).toBe("00000007 — Steel sheet 1.0 mm");
    expect(screen.getByRole("listbox", { hidden: true }).hidden).toBe(true);
  });

  it("opens on focus with every option, and filters as words are typed, announcing the count", () => {
    render(<Field />);

    fireEvent.focus(input());
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(shownOptions()).toHaveLength(4);

    type("steel sh");
    expect(shownOptions()).toEqual(["00000001—Steel sheet 2 mmkg", "00000007—Steel sheet 1.0 mmkg"]);
    expect(screen.getByRole("status").textContent).toBe("2 results");
    expect(screen.getAllByRole("option")[0].querySelectorAll("mark")).toHaveLength(2);

    type("hinge");
    expect(screen.getByRole("status").textContent).toBe("1 result");
  });

  it("says when nothing matches", () => {
    render(<Field />);

    type("brass");
    expect(shownOptions()).toEqual([]);
    expect(screen.getByRole("listbox").textContent).toBe("Nothing matches “brass”.");
    expect(screen.getByRole("status").textContent).toBe("Nothing matches “brass”.");
  });

  it("shows at most `limit` rows and says how many more there are", () => {
    render(<Field limit={2} />);

    fireEvent.focus(input());
    expect(shownOptions()).toHaveLength(2);
    expect(screen.getByRole("listbox").textContent).toContain("2 more");
    expect(screen.getByRole("status").textContent).toBe("4 results");
  });

  it("moves with the arrow keys and chooses with Enter, without submitting a form", () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    type("steel");
    expect(input().getAttribute("aria-activedescendant")).toMatch(/-0$/);
    key("ArrowDown");
    key("ArrowDown");
    key("ArrowDown");
    expect(screen.getAllByRole("option")[2].getAttribute("aria-selected")).toBe("true");
    key("ArrowUp");
    expect(input().getAttribute("aria-activedescendant")).toMatch(/-1$/);
    const enter = fireEvent.keyDown(input(), { key: "Enter" });

    expect(enter).toBe(false);
    expect(onChange).toHaveBeenCalledWith("m7");
    expect((input() as HTMLInputElement).value).toBe("00000007 — Steel sheet 1.0 mm");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(true);
  });

  it("opens with ArrowDown and never moves above the first row", () => {
    render(<Field />);

    key("ArrowDown");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    key("ArrowUp");
    key("ArrowUp");
    expect(input().getAttribute("aria-activedescendant")).toMatch(/-0$/);
  });

  it("chooses with the mouse, keeping focus in the field", () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    fireEvent.click(input());
    const [, second] = screen.getAllByRole("option");
    fireEvent.mouseMove(second);
    expect(second.getAttribute("aria-selected")).toBe("true");
    expect(fireEvent.mouseDown(second)).toBe(false);

    expect(onChange).toHaveBeenCalledWith("m7");
  });

  it("refuses typed text that isn't a choice when the field is left, clearing the value", () => {
    const onChange = vi.fn();
    render(<Field initial="m1" onChange={onChange} />);

    type("steel 3 mm");
    fireEvent.blur(input());

    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByTestId("value").textContent).toBe("");
    expect((input() as HTMLInputElement).value).toBe("steel 3 mm");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    const note = screen.getByText("Choose a material from the list.");
    expect(input().getAttribute("aria-describedby")).toBe(note.closest("p")!.id);

    type("cam");
    expect(screen.queryByText("Choose a material from the list.")).toBeNull();
  });

  it("clears the value when the field is emptied, without refusing", () => {
    const onChange = vi.fn();
    render(<Field initial="m1" onChange={onChange} />);

    type("  ");
    fireEvent.blur(input());

    expect(onChange).toHaveBeenCalledWith("");
    expect(input().getAttribute("aria-invalid")).toBeNull();
  });

  it("keeps a chosen option when the field is left unchanged", () => {
    const onChange = vi.fn();
    render(<Field initial="m1" onChange={onChange} />);

    fireEvent.focus(input());
    expect(shownOptions()).toHaveLength(4);
    fireEvent.blur(input());

    expect(onChange).not.toHaveBeenCalled();
    expect(input().getAttribute("aria-invalid")).toBeNull();
  });

  it("leaves a cleared value cleared without telling the form twice", () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    type("nothing like it");
    fireEvent.blur(input());
    type("");
    fireEvent.blur(input());

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a value set from outside instead of the typed text", () => {
    render(<Field initial="m1" />);

    type("ste");
    fireEvent.blur(input());
    fireEvent.click(screen.getByRole("button", { name: "Reset to cam lock" }));

    expect((input() as HTMLInputElement).value).toBe("00000011 — Cam lock");
    expect(input().getAttribute("aria-invalid")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect((input() as HTMLInputElement).value).toBe("");
  });

  it("refuses unmatched text on Enter instead of submitting the previous value", () => {
    const onChange = vi.fn();
    render(<Field initial="m1" onChange={onChange} />);

    type("brass");
    const enter = fireEvent.keyDown(input(), { key: "Enter" });

    expect(enter).toBe(false);
    expect(onChange).toHaveBeenCalledWith("");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Choose a material from the list.")).toBeTruthy();
  });

  it("clears the value on Enter in an emptied field and lets the form submit", () => {
    const onChange = vi.fn();
    render(<Field initial="m1" onChange={onChange} />);

    type("");
    expect(input().getAttribute("aria-activedescendant")).toBeNull();
    const enter = fireEvent.keyDown(input(), { key: "Enter" });

    expect(enter).toBe(true);
    expect(onChange).toHaveBeenCalledWith("");
    expect(input().getAttribute("aria-invalid")).toBeNull();
  });

  it("lets Enter submit when the chosen option is left untouched", () => {
    const onChange = vi.fn();
    render(<Field initial="m7" onChange={onChange} />);

    fireEvent.focus(input());
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("names its list after the field's visible label when given one", () => {
    render(
      <>
        <label id="location-label" htmlFor="location">
          Location
        </label>
        <Autocomplete id="location" aria-labelledby="location-label" aria-label="ignored" options={options} value="" onChange={vi.fn()} labels={labels} />
      </>,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "Location" }));
    expect(screen.getByRole("listbox", { name: "Location" }).getAttribute("aria-label")).toBeNull();
  });

  it("names its list with aria-label when there is no visible label", () => {
    render(<Field />);

    fireEvent.focus(input());
    expect(screen.getByRole("listbox", { name: "Material" })).toBeTruthy();
  });

  it("submits the chosen value in a hidden input when named", () => {
    const { container } = render(<Field initial="m10" name="material" />);

    expect(container.querySelector<HTMLInputElement>("input[type=hidden][name=material]")!.value).toBe("m10");
  });

  it("uses the reader's plural forms", () => {
    render(
      <Autocomplete
        aria-label="Material"
        options={options}
        value=""
        onChange={vi.fn()}
        locale="pl"
        labels={{ ...labels, results: { one: "{count} wynik", few: "{count} wyniki", other: "{count} wyników" } }}
      />,
    );

    type("steel");
    expect(screen.getByRole("status").textContent).toBe("3 wyniki");
  });

  it("closes only its list on Escape inside a dialog, and the dialog on the next Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Edit BOM</DialogTitle>
          <DialogDescription>Components</DialogDescription>
          <Field />
        </DialogContent>
      </Dialog>,
    );

    act(() => input().focus());
    type("steel");
    key("Escape");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(onOpenChange).not.toHaveBeenCalled();

    key("Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores other keys and Escape from elsewhere while open", () => {
    render(<Field />);

    type("steel");
    fireEvent.keyDown(window, { key: "Escape" });
    key("Tab");
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });

  it("opens its list upward when the field sits low in a scrolling container", () => {
    render(
      <div data-testid="dialog" style={{ overflowY: "auto" }}>
        <Field />
      </div>,
    );
    vi.spyOn(screen.getByTestId("dialog"), "getBoundingClientRect").mockReturnValue({ top: 168, bottom: 628 } as DOMRect);
    vi.spyOn(input(), "getBoundingClientRect").mockReturnValue({ top: 560, bottom: 592 } as DOMRect);

    fireEvent.focus(input());
    const list = screen.getByRole("listbox");
    expect(list.dataset.side).toBe("above");
    expect(list.className).toContain("bottom-full");
    expect(list.style.maxHeight).toBe("320px");
    // Typing keeps the side it opened on.
    type("steel");
    expect(screen.getByRole("listbox").dataset.side).toBe("above");
  });
});
