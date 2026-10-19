import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { tokensLabels } from "./labels";
import { TokensTable } from "./tokens-table";

vi.mock("../../app/admin/(global)/tokens/actions", () => ({ revokeApiToken: vi.fn() }));

const tokens = [
  { id: "t1", name: "agent1", createdAt: new Date("2026-10-19T11:02:30Z"), lastUsedAt: new Date("2026-10-19T11:40:59Z") },
  { id: "t2", name: "build", createdAt: new Date("2026-10-19T11:05:00Z"), lastUsedAt: null },
];

describe("TokensTable", () => {
  it("lists name, created and last used to the minute, Never when unused, with Revoke on each row", () => {
    render(<TokensTable tokens={tokens} labels={tokensLabels(en)} />);

    const rows = within(screen.getByRole("table", { name: "API tokens" })).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["agent1", "2026-10-19 11:02 UTC", "2026-10-19 11:40 UTC", "Revoke"],
      ["build", "2026-10-19 11:05 UTC", "Never", "Revoke"],
    ]);
    expect(screen.getByRole("button", { name: "Revoke build" })).toBeTruthy();
  });

  it("says when there are no tokens", () => {
    render(<TokensTable tokens={[]} labels={tokensLabels(en)} />);

    expect(screen.getByText("No tokens yet.")).toBeTruthy();
  });
});
