import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationCell, MaterialCell, withReferences } from "./references";

const materials = [
  { id: "00000001", type: "raw", description: "Bolt M8", baseUnit: "each", active: true, createdAt: new Date(), version: 1 },
  { id: "00000002", type: "raw", description: "Old paint", baseUnit: "l", active: false, createdAt: new Date(), version: 1 },
] as const;
const locations = [
  { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 },
  { id: "00000003", name: "Old quarry", active: false, createdAt: new Date(), version: 2 },
];

describe("withReferences", () => {
  it("adds each row's material and location details", () => {
    expect(withReferences([{ material: "00000002", location: "00000003", quantity: "1" }], [...materials], locations)).toEqual([
      {
        material: "00000002",
        location: "00000003",
        quantity: "1",
        materialDescription: "Old paint",
        materialActive: false,
        baseUnit: "l",
        locationName: "Old quarry",
        locationActive: false,
      },
    ]);
  });
});

describe("cells", () => {
  const row = withReferences([{ material: "00000002", location: "00000003" }], [...materials], locations)[0];

  it("link the material to its page and mark inactive references", () => {
    render(
      <>
        <MaterialCell tenant="prod" row={row} inactive="Inactive" />
        <LocationCell row={row} inactive="Inactive" />
      </>,
    );
    expect(screen.getByRole("link", { name: "00000002" }).getAttribute("href")).toBe("/admin/prod/materials/00000002");
    expect(screen.getByText("Old paint")).toBeTruthy();
    expect(screen.getByText("Old quarry")).toBeTruthy();
    expect(screen.getAllByText("Inactive").map((badge) => [badge.dataset.slot, badge.dataset.tone, badge.className.includes("border-dashed")])).toEqual([
      ["status-badge", "neutral", true],
      ["status-badge", "neutral", true],
    ]);
  });

  it("show no badge for active references", () => {
    const active = withReferences([{ material: "00000001", location: "00000001" }], [...materials], locations)[0];
    render(<MaterialCell tenant="test" row={active} inactive="Inactive" />);
    render(<LocationCell row={active} inactive="Inactive" />);
    expect(screen.queryByText("Inactive")).toBeNull();
  });

  it("mark a search's words in the IDs, the description and the name (#217)", () => {
    render(
      <>
        <MaterialCell tenant="prod" row={row} inactive="Inactive" query="paint 0003 quarry" />
        <LocationCell row={row} inactive="Inactive" query="paint 0003 quarry" />
      </>,
    );
    expect([...document.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["paint", "0003", "quarry"]);
  });
});
