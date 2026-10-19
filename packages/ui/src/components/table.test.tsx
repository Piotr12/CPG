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
});
