import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "./native-select";

describe("NativeSelect", () => {
  it("renders a native select with its options, size and extra wrapper classes", () => {
    render(
      <NativeSelect aria-label="Type" size="sm" className="extra" defaultValue="b">
        <NativeSelectOptGroup label="Group">
          <NativeSelectOption value="a">A</NativeSelectOption>
          <NativeSelectOption value="b">B</NativeSelectOption>
        </NativeSelectOptGroup>
      </NativeSelect>,
    );

    const select = screen.getByLabelText("Type") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("b");
    expect(select.dataset.size).toBe("sm");
    expect(select.parentElement!.className).toContain("extra");
    expect(select.className.split(" ")).toEqual(expect.arrayContaining([...["focus-visible:ring-2", "focus-visible:ring-ring", "focus-visible:ring-offset-2", "focus-visible:ring-offset-background"], "aria-invalid:border-danger", "rounded-md", "pl-3"]));
    expect(select.className).not.toMatch(/bg-input|rounded-\[|ring-ring\//);
    expect(screen.getAllByRole("option").map((option) => option.dataset.slot)).toEqual([
      "native-select-option",
      "native-select-option",
    ]);
    expect(screen.getByRole("group").dataset.slot).toBe("native-select-optgroup");
  });

  it("defaults to the default size", () => {
    render(<NativeSelect aria-label="Type" />);

    expect((screen.getByLabelText("Type") as HTMLSelectElement).dataset.size).toBe("default");
  });
});
