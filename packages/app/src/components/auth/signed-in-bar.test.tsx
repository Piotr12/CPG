import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignedInBar } from "./signed-in-bar";

vi.mock("../../app/admin/actions", () => ({ signOut: vi.fn() }));

describe("SignedInBar", () => {
  it("names the signed-in user and offers to sign out", () => {
    render(<SignedInBar username="admin" />);

    expect(screen.getByText("admin").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Sign out" }).closest("form")).toBeTruthy();
  });
});
