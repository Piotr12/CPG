import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
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
      "Tenants",
      "Managing users",
      "API tokens",
      "Test and Prod",
      "The Test dataset's planning week",
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
      "Statistical units",
      "Purchase requisitions",
      "Purchase orders",
      "A purchase order and its lines",
      "Production orders",
      "A production order",
      "Transfers",
      "A transfer: dispatch, receive, write off",
      "Customer orders",
      "Maintaining a customer order",
      "Shipments and goods issues",
      "Import from spreadsheet",
      "Physical stock and corrections",
      "Stock import",
      "Stock report",
      "Variance report",
      "Demand review",
      "MRP",
      "Language and theme",
      "Using help",
    ]);
    expect(screen.getByRole("heading", { name: "Signing in" }).closest("section")?.id).toBe("signing-in");
    expect(screen.getByText("Screen: /login")).toBeTruthy();
    // App screens stay plain text; a help page of its own is a link.
    expect(screen.queryByRole("link", { name: "Screen: /login" })).toBeNull();
    expect(screen.getByRole("link", { name: "Screen: /help/test-dataset" }).getAttribute("href")).toBe("/help/test-dataset");
    expect(screen.queryByRole("link", { name: "Show all topics" })).toBeNull();
    expect(mocks.connection).toHaveBeenCalledOnce();
  });

  it("searches on the server with a plain GET form", async () => {
    await renderHelp("minutes");

    const form = screen.getByRole("search") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/help");
    const searchbox = screen.getByRole("searchbox", { name: "Search help" }) as HTMLInputElement;
    expect(searchbox.value).toBe("minutes");
    expect(searchbox.name).toBe("q");
    // A visible label, not an aria-label, and a submit button of the same 32 px height as the field.
    expect(screen.getByText("Search help").tagName).toBe("LABEL");
    expect(searchbox.getAttribute("aria-label")).toBeNull();
    const submit = screen.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    expect(submit.type).toBe("submit");
    expect([searchbox.className, submit.className].every((className) => className.includes("h-8"))).toBe(true);
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
    expect(screen.getByRole("link", { name: "Show all topics" }).getAttribute("href")).toBe("/help");
  });

  it("shows the language-neutral loading shell until the request-time content streams", () => {
    const main = HelpPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });
    const { fallback } = (main.props.children as { props: { fallback: ReactElement } }).props;

    expect(fallback.type).toBe(LoadingMessage);
  });

  it("speaks Polish to a Polish account (UX-013)", async () => {
    await renderHelp("logowanie", "pl");

    expect(screen.getByRole("heading", { level: 1, name: "Pomoc" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(topicTitles()).toContain("Logowanie");
    expect(screen.getByText(/Pasujące tematy dla „logowanie”/)).toBeTruthy();
    expect(screen.getByText("Ekran: /login")).toBeTruthy();
  });

  it("lets a topic's long words, such as API paths, wrap rather than widen the page", async () => {
    await renderHelp(undefined);

    const section = screen.getByRole("heading", { name: "Stock report" }).closest("section");
    expect(section?.className).toContain("wrap-break-word");
    expect(section?.className).toContain("min-w-0");
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("Help · Caveman Planning Good");
  });
});
