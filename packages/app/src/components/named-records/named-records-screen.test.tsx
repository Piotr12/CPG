import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { NamedRecordsScreen } from "./named-records-screen";

vi.mock("./create-named-record-dialog", () => ({ CreateNamedRecordDialog: () => <button>Create location</button> }));

const TENANT = { code: "test", name: "Test", generation: 1, readOnly: false };
const renderScreen = (admin: boolean, readOnly = false) =>
  render(
    <NamedRecordsScreen kind="locations" tenant={{ ...TENANT, readOnly }} records={[]} locale="en" messages={en} admin={admin} create={vi.fn()} update={vi.fn()} />,
  );

describe("NamedRecordsScreen", () => {
  it("heads the list with the one h1, its intro and the admin's Create", () => {
    renderScreen(true);

    const header = screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Locations — Test"]);
    expect(within(header).getByText(en.locations.intro)).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Create location" })).toBeTruthy();
    expect(screen.getByText("No locations in Test yet. Create the first one with Create location.")).toBeTruthy();
  });

  it("gives the admin of a read-only tenant no Create, and tells them whom to ask", () => {
    renderScreen(true, true);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Ask an administrator to add locations.")).toBeTruthy();
  });
});
