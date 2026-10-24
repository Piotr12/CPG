import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../tests/setup/server-components";
import { en } from "../i18n/messages/en";
import { pl } from "../i18n/messages/pl";
import NotFound, { metadata } from "./not-found";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

describe("NotFound", () => {
  beforeEach(() => {
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("says the page isn't there and why, and leads to Tenants, at request time", async () => {
    render(await resolveServerComponents(NotFound()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(screen.getByText("Page not found.")).toBeTruthy();
    expect(screen.getByText("The address may be mistyped, or the record belongs to the other tenant.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Tenants" }).getAttribute("href")).toBe("/admin");
    expect(document.querySelector("main")?.className).toContain("max-w-3xl");
  });

  it("speaks the reader's language", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(NotFound()));

    const link = screen.getByRole("link", { name: "Przejdź do Środowisk" });
    expect(link.closest("[lang]")?.getAttribute("lang")).toBe("pl");
  });

  it("shows the loading frame first", () => {
    const { container } = render(NotFound().props.children.props.fallback);

    expect(container.querySelector('[aria-busy="true"] [data-slot="skeleton"]')).toBeTruthy();
    expect(container.textContent).toBe("");
  });

  it("is titled and kept out of search indexes, even when it answers 200 after streaming", () => {
    expect(metadata).toEqual({ title: "Page not found · Caveman Planning Good", robots: { index: false } });
  });
});
