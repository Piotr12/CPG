import { render, screen } from "@testing-library/react";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminPage, { metadata } from "./page";

const { connection, getStatus } = vi.hoisted(() => ({ connection: vi.fn(), getStatus: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("@cpg/core", () => ({ requestScope: async () => ({ cradle: { systemStatusService: { getStatus } } }) }));

/**
 * React DOM can't render async server components, so await them first and render the result.
 * Suspense boundaries stay in place, which is fine: everything inside them is already resolved.
 */
async function resolveServerComponents(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerComponents));
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") {
    return resolveServerComponents(await (node.type as (props: object) => Promise<ReactNode>)(node.props));
  }
  if (node.props.children === undefined) return node;
  const children = await resolveServerComponents(node.props.children);
  return cloneElement(node as ReactElement, {}, ...Children.toArray(children));
}

const status = { databasePath: "/externaldata/cpg.sqlite", appliedMigrations: 3, pendingMigrations: 0, settings: 7 };

describe("AdminPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows the database status", async () => {
    getStatus.mockResolvedValue(status);

    render(await resolveServerComponents(AdminPage()));

    expect(connection).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Cave control" })).toBeTruthy();
    expect(screen.getByText("/externaldata/cpg.sqlite")).toBeTruthy();
    expect(screen.getByText("3 migrations applied")).toBeTruthy();
    expect(screen.getByText("7 settings")).toBeTruthy();
    expect(screen.getByText("0 pending").dataset.variant).toBe("outline");
  });

  it("flags pending migrations", async () => {
    getStatus.mockResolvedValue({ ...status, pendingMigrations: 2 });

    render(await resolveServerComponents(AdminPage()));

    expect(screen.getByText("2 pending").dataset.variant).toBe("destructive");
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("Admin · Caveman Planning Good");
  });
});
