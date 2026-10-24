import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequisitionView } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { listLinks } from "../lists/list-params";
import { RequisitionsScreen } from "./requisitions-screen";

vi.mock("../../app/admin/[tenant]/purchase-requisitions/actions", () => ({ cancelRequisition: vi.fn(), closeEarlyRequisition: vi.fn(), createRequisition: vi.fn(), setRequisitionRequiredDate: vi.fn() }));

const material = (active: boolean) => ({ id: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg", active, createdAt: new Date(), version: 1 }) as const;
const location = { id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 };
const requisition = (id: string, converted: string, status: string) => ({ id, material: "00000001", location: "00000001", quantity: "100.000000", enteredQuantity: "100", enteredUnit: "kg",
  numerator: "1", denominator: "1", requiredDate: "2027-03-01", converted, abandoned: "0.000000", outstanding: "40.000000", status, createdAt: new Date(), version: 1 }) as unknown as RequisitionView;
const tenant = { code: "test", name: "Test", generation: 1, readOnly: false };
const props = { tenant, requisitions: [requisition("00000001", "60.000000", "open"), requisition("00000002", "0.000000", "open"), requisition("00000003", "100.000000", "completed")],
  page: 1, pages: 1, list: { search: { q: "", typed: "" }, sort: { sort: "id" as const, dir: "asc" as const }, count: 3,
    links: listLinks({ path: "/admin/test/purchase-requisitions", search: "", sort: { sort: "id", dir: "asc" }, defaults: { sort: "id", dir: "asc" } }) },
  materials: [material(true)], locations: [location], units: {}, locale: "en" as const, messages: en };
const header = () => screen.getByRole("heading", { level: 1 }).closest("[data-slot=page-header]") as HTMLElement;
const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("RequisitionsScreen", () => {
  it("heads the list with Create requisition, badges each status, and names each row's lifecycle action", () => {
    render(<RequisitionsScreen {...props} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Purchase requisitions — Test");
    expect(within(header()).getByText(en.purchaseRequisitions.intro)).toBeTruthy();
    expect(within(header()).getByRole("button", { name: en.purchaseRequisitions.create.open })).toBeTruthy();
    const [converted, untouched, done] = rows();
    expect(within(converted).getByText("Open").closest("[data-slot=status-badge]")?.getAttribute("data-tone")).toBe("neutral");
    expect(within(done).getByText("Completed").closest("[data-slot=status-badge]")?.getAttribute("data-tone")).toBe("success");
    expect(within(converted).getByRole("button", { name: "Close requisition early… — Purchase requisitions 00000001" }).getAttribute("data-variant")).toBe("destructive");
    expect(within(untouched).getByRole("button", { name: "Cancel requisition… — Purchase requisitions 00000002" })).toBeTruthy();
    expect(within(done).queryByRole("button")).toBeNull();
    const cells = within(converted).getAllByRole("cell");
    expect(cells[0].className).toContain("font-mono"); expect(cells[3].className).toContain("tabular-nums"); expect(cells[6].className).toContain("hidden md:table-cell");
  });

  it("badges an inactive material in Polish and offers no actions in a read-only tenant", () => {
    render(<RequisitionsScreen {...props} tenant={{ ...tenant, readOnly: true }} materials={[material(false)]} messages={pl} locale="pl" />);
    expect(within(header()).queryByRole("button")).toBeNull();
    expect(screen.getByRole("searchbox", { name: pl.purchaseRequisitions.search.label })).toBeTruthy();
    const inactive = within(rows()[0]).getByText(pl.purchaseRequisitions.inactive).closest("[data-slot=status-badge]")!;
    expect(inactive.getAttribute("data-tone")).toBe("neutral"); expect(inactive.className).toContain("border-dashed");
    expect(within(rows()[0]).queryByRole("button")).toBeNull();
  });
});
