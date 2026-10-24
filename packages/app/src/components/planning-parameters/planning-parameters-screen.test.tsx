import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { PlanningParametersScreen } from "./planning-parameters-screen";

vi.mock("./add-planning-parameters-dialog", () => ({ AddPlanningParametersDialog: () => <button>Add parameters</button> }));
vi.mock("./planning-parameter-actions", () => ({ PlanningParameterActions: () => <button>Row actions</button> }));

const MATERIALS = [{ id: "00000005", type: "finished" as const, description: "Cabinet", baseUnit: "each", active: true, createdAt: new Date(), version: 1 }];
const LOCATIONS = [{ id: "00000001", name: "Main plant", active: false, createdAt: new Date(), version: 1 }];
const set = (procurement: "make" | "buy") => ({
  material: "00000005",
  location: "00000001",
  procurement,
  leadTimeDays: 2,
  minimumQuantity: "50.000000",
  lotMultiple: "0.500000",
  version: 1,
});
const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };
const renderScreen = (sets: object[], admin = true) =>
  render(<PlanningParametersScreen tenant={TENANT} sets={sets as never} materials={MATERIALS} locations={LOCATIONS} locale="en" messages={en} admin={admin} />);

describe("PlanningParametersScreen", () => {
  it("heads the list with the one h1 and the admin's Add, then the table with right-aligned quantities", () => {
    renderScreen([set("make")]);

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Planning parameters — Test");
    expect(within(header).getByRole("button", { name: "Add parameters" })).toBeTruthy();
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[0].className).toMatch(/\bsticky left-0\b/);
    expect(cells[3].className).toMatch(/\btext-right tabular-nums\b/);
    expect(cells[4].textContent).toBe("50 each");
    expect(cells[4].className).toContain("hidden md:table-cell");
    // Procurement is a category (a tag); the inactive location is a state (a dashed quiet badge).
    expect(within(cells[2]).getByText("Make").dataset.slot).toBe("badge");
    expect(within(cells[1]).getByText("Inactive").dataset.tone).toBe("neutral");
  });

  it("tells a reader whom to ask when the list is empty", () => {
    renderScreen([], false);

    expect(screen.getByText("Ask an administrator to add planning parameters.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
