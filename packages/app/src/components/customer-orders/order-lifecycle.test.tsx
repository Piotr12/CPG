import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { customers, locations, materials, order, tenant } from "../../../../../tests/setup/customer-orders";
import { en } from "../../i18n/messages/en";
import { OrdersScreen } from "./order-screen";

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), refresh: vi.fn() }));
vi.mock("@cpg/core", async (original) => {
  const core = await original<typeof import("@cpg/core")>();
  return { ...core, tenantServerAction:
    (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (_tenant: string, _generation: number, raw: unknown) => core.serverAction(schema,
        (input) => handler(input, { cradle: { customerOrderService: { cancel: mocks.cancel } } }))(raw),
  };
});
vi.mock("../../auth/require-admin", () => ({ currentUser: async () => ({ sessionId: "s", userId: "u", username: "alice", role: "user" }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
afterEach(() => vi.clearAllMocks());
it("keeps a removed line's conflict visible by deferring the refresh that would remove its real table row", async () => {
  const props = { tenant, orders: [], customers, locations, materials, units: {}, locale: "en" as const, messages: en };
  const view = render(<OrdersScreen {...props} order={order} />);
  mocks.refresh.mockImplementation(() => view.rerender(<OrdersScreen {...props} order={{ ...order, version: order.version + 1, lines: [] }} />));
  const { versionConflict } = await import("@cpg/core");
  mocks.cancel.mockRejectedValue(versionConflict());
  fireEvent.click(within(screen.getByRole("table", { name: "Lines" })).getByRole("button", { name: /Cancel/ }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect((await screen.findByRole("alert")).textContent).toContain(en.errors.VERSION_CONFLICT);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.cancel).toHaveBeenCalledWith(order.id, order.version, expect.anything(), [order.lines[0].id]);
  fireEvent.click(screen.getByRole("button", { name: "Keep open" }));
  view.rerender(<OrdersScreen {...props} order={{ ...order, version: order.version + 1, lines: [] }} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(within(screen.getByRole("table", { name: "Lines" })).queryByRole("button")).toBeNull();
});
