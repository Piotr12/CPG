import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import HelpPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

async function renderHelp(q: string | undefined, locale: "en" | "pl" = "en") {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
  render(await resolveServerComponents(HelpPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ q }) })));
}
const topicTitles = () => screen.queryAllByRole("heading", { level: 2 }).map(({ textContent }) => textContent);

describe("HelpPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("lists every topic, with its screen and anchor, when nothing is searched", async () => {
    await renderHelp(undefined);

    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeTruthy();
    expect(topicTitles()).toEqual([
      "Getting started with CPG",
      "Signing in",
      "Cave control",
      "Managing users",
      "API tokens",
      "Test and Prod",
      "The Global audit",
      "A tenant's audit",
      "Materials",
      "A material and its unit conversions",
      "Locations",
      "Customers",
      "Suppliers",
      "Planning parameters",
      "Safety stock",
      "Forecasts",
      "BOMs",
      "A BOM and its revisions",
      "Purchase requisitions",
      "Purchase orders",
      "A purchase order and its lines",
      "Customer orders",
      "Maintaining a customer order",
      "Import from spreadsheet",
      "Physical stock and corrections",
      "Language and theme",
      "Using help",
    ]);
    expect(screen.getByRole("heading", { name: "Signing in" }).closest("section")?.id).toBe("signing-in");
    expect(screen.getByText("Screen: /login")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Show all topics" })).toBeNull();
    expect(mocks.connection).toHaveBeenCalledOnce();
  });

  it("searches on the server with a plain GET form", async () => {
    await renderHelp("minutes");

    const form = screen.getByRole("search") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/help");
    expect((screen.getByRole("searchbox", { name: "Search help" }) as HTMLInputElement).value).toBe("minutes");
    expect(topicTitles()).toEqual(["Signing in"]);
    expect(screen.getByText(/1 topic matches “minutes”\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Show all topics" }).getAttribute("href")).toBe("/help");
  });

  it("counts several matches", async () => {
    await renderHelp("sign");

    expect(screen.getByText(/topics match “sign”\./)).toBeTruthy();
  });

  it("says so when nothing matches", async () => {
    await renderHelp("forecast accuracy");

    expect(topicTitles()).toEqual([]);
    expect(screen.getByText(/No help topics match “forecast accuracy”\./)).toBeTruthy();
  });

  it("speaks Polish to a Polish account (UX-013)", async () => {
    await renderHelp("logowanie", "pl");

    expect(screen.getByRole("heading", { level: 1, name: "Pomoc" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(topicTitles()).toContain("Logowanie");
    expect(screen.getByText(/Pasujące tematy dla „logowanie”/)).toBeTruthy();
    expect(screen.getByText("Ekran: /login")).toBeTruthy();
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("Help · Caveman Planning Good");
  });
});
