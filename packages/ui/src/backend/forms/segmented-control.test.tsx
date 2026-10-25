import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SegmentedControl, type SegmentedControlProps } from "./segmented-control";

const units = [
  { value: "each", label: "each", disabled: true },
  { value: "pallet", label: "pallet", disabled: true },
  { value: "su", label: "SU" },
];
const buckets = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function Filter(props: Partial<SegmentedControlProps>) {
  return (
    <form role="search">
      <span id="bucket-label">Time bucket</span>
      <SegmentedControl name="bucket" options={buckets} defaultValue="week" aria-labelledby="bucket-label" {...props} />
    </form>
  );
}

const submitted = () => Object.fromEntries(new FormData(screen.getByRole("search") as HTMLFormElement));

describe("SegmentedControl", () => {
  it("is a radio group named by its visible label, submitting the default choice", () => {
    render(<Filter />);

    const group = screen.getByRole("radiogroup", { name: "Time bucket" });
    expect(group.getAttribute("aria-label")).toBeNull();
    expect(screen.getAllByRole("radio").map((radio) => [(radio as HTMLInputElement).name, (radio as HTMLInputElement).value])).toEqual([
      ["bucket", "day"],
      ["bucket", "week"],
      ["bucket", "month"],
    ]);
    expect((screen.getByRole("radio", { name: "Week" }) as HTMLInputElement).checked).toBe(true);
    expect(submitted()).toEqual({ bucket: "week" });
  });

  it("submits the segment chosen by clicking its label", () => {
    render(<Filter />);

    fireEvent.click(screen.getByText("Month"));

    expect((screen.getByRole("radio", { name: "Month" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Week" }) as HTMLInputElement).checked).toBe(false);
    expect(submitted()).toEqual({ bucket: "month" });
  });

  it("takes its name from the label prop without a visible label, and checks nothing without a default", () => {
    render(
      <form role="search">
        <SegmentedControl name="unit" options={units} label="Unit" id="unit" className="ml-auto" />
      </form>,
    );

    const group = screen.getByRole("radiogroup", { name: "Unit" });
    expect(group.id).toBe("unit");
    expect(group.className).toContain("ml-auto");
    expect(screen.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    expect(submitted()).toEqual({});
  });

  it("shows disabled segments that can't be chosen", () => {
    render(<Filter name="unit" options={units} defaultValue="su" aria-labelledby={undefined} label="Unit" />);

    const each = screen.getByRole("radio", { name: "each" }) as HTMLInputElement;
    expect(each.disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "pallet" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("radio", { name: "SU" }) as HTMLInputElement).disabled).toBe(false);

    fireEvent.click(screen.getByText("each"));

    expect(each.checked).toBe(false);
    expect(submitted()).toEqual({ unit: "su" });
  });

  it("disables every segment when the whole control is disabled", () => {
    render(<Filter disabled />);

    expect(screen.getAllByRole("radio").every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
    expect(submitted()).toEqual({});
  });

  it("starts afresh when remounted with a new key", () => {
    const { rerender } = render(<Filter key="week" />);
    fireEvent.click(screen.getByText("Day"));
    expect(submitted()).toEqual({ bucket: "day" });

    rerender(<Filter key="month" defaultValue="month" />);

    expect(submitted()).toEqual({ bucket: "month" });
  });

  it("renders native radios on the server, so a GET form submits it without JavaScript", () => {
    const html = renderToString(<SegmentedControl name="bucket" options={buckets} defaultValue="month" label="Time bucket" />);

    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/<input type="radio"[^>]*name="bucket"[^>]*checked=""[^>]*value="month"/);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
  });
});
