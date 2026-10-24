import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table";

describe("Table", () => {
  it("renders every part with its slot and extra classes", () => {
    render(
      <Table className="tb">
        <TableCaption className="cap">caption</TableCaption>
        <TableHeader className="th">
          <TableRow className="tr">
            <TableHead className="hd">head</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bd">
          <TableRow>
            <TableCell className="cl">cell</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter className="ft">
          <TableRow>
            <TableCell>footer</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    const table = screen.getByRole("table");
    expect(table.dataset.slot).toBe("table");
    expect(table.classList).toContain("tb");
    expect(table.parentElement!.dataset.slot).toBe("table-container");
    // Unlabelled, the container is a plain scroller: no region, not in the tab order.
    expect(table.parentElement!.hasAttribute("role")).toBe(false);
    expect(table.parentElement!.hasAttribute("tabindex")).toBe(false);
    const parts: [HTMLElement, string, string][] = [
      [screen.getByText("caption"), "table-caption", "cap"],
      [screen.getByText("head"), "table-head", "hd"],
      [screen.getByText("head").parentElement!, "table-row", "tr"],
      [screen.getByText("head").parentElement!.parentElement!, "table-header", "th"],
      [screen.getByText("cell"), "table-cell", "cl"],
      [screen.getByText("cell").parentElement!.parentElement!, "table-body", "bd"],
      [screen.getByText("footer").parentElement!.parentElement!, "table-footer", "ft"],
    ];
    for (const [element, slot, className] of parts) {
      expect(element.dataset.slot).toBe(slot);
      expect(element.classList).toContain(className);
    }
  });

  it("makes a labelled scroll container a focusable region", () => {
    render(
      <Table aria-label="Orders" scrollLabel="Orders">
        <TableBody>
          <TableRow>
            <TableCell>cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const region = screen.getByRole("region", { name: "Orders" });
    expect(region.dataset.slot).toBe("table-container");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.className).toBe("relative w-full overflow-x-auto");
    expect(region.firstElementChild).toBe(screen.getByRole("table", { name: "Orders" }));
  });
});
