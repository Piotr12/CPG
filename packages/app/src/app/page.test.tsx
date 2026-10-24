import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { resolveServerComponents } from "../../../../tests/setup/server-components";
import { HELP_TOPIC_IDS } from "../help/topics";
import { en } from "../i18n/messages/en";
import { pl } from "../i18n/messages/pl";
import HomePage from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../auth/require-admin", () => ({ currentUser: mocks.currentUser, HOME_PATH: "/admin", SIGN_IN_PATH: "/login" }));

async function renderAs(locale: "en" | "pl", user: object | null = null) {
  mocks.currentUser.mockResolvedValue(user);
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
  render(await resolveServerComponents(HomePage()));
}

describe("HomePage", () => {
  afterEach(() => vi.clearAllMocks());

  it("introduces the app at request time", async () => {
    await renderAs("en");

    expect(screen.getByRole("heading", { level: 1, name: "Caveman Planning Good" })).toBeTruthy();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(mocks.getMessages.mock.invocationCallOrder[0]);
  });

  it("offers a visitor the way in: Sign in, to the sign-in screen", async () => {
    await renderAs("en");

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByRole("link", { name: "Open CPG" })).toBeNull();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(mocks.currentUser.mock.invocationCallOrder[0]);
  });

  it("offers a signed-in account Open CPG instead, in its language", async () => {
    await renderAs("pl", { userId: "u1", username: "alice", role: "user" });

    expect(screen.getByRole("link", { name: "Otwórz CPG" }).getAttribute("href")).toBe("/admin");
    expect(screen.queryByRole("link", { name: "Zaloguj się" })).toBeNull();
  });

  it("puts the mark and the plain tagline above the way in", async () => {
    await renderAs("en");

    const mark = document.querySelector("[data-slot=mammoth-mark]");
    expect(mark?.getAttribute("width")).toBe("40");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText(en.home.tagline).className).toContain("text-muted-foreground");
    expect(en.home.tagline).toBe("A small MRP II planning tool: it turns what customers want into plans for what to buy and what to make.");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("data-slot")).toBe("button");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("names what is built, in the order work flows, each linked to its help topic", async () => {
    await renderAs("en");

    const flow = screen.getByRole("list", { name: "What CPG covers" });
    const links = within(flow).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Forecasts and customer orders", "/help#forecasts"],
      ["BOMs", "/help#boms"],
      ["Production and purchase orders", "/help#production-orders"],
      ["Stock", "/help#stock"],
    ]);
    // Arrows join the steps: none before the first, decorative only.
    const arrows = within(flow).getAllByRole("listitem").map((item) => item.querySelector("svg"));
    expect(arrows[0]).toBeNull();
    expect(arrows.slice(1).every((arrow) => arrow?.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("links only to help topics that exist", async () => {
    await renderAs("en");

    const ids = screen.getAllByRole("listitem").map((item) => item.querySelector("a")?.getAttribute("href")?.replace("/help#", ""));
    expect(ids.every((id) => (HELP_TOPIC_IDS as readonly (string | undefined)[]).includes(id))).toBe(true);
  });

  it("leaves the footer to the layout", async () => {
    await renderAs("en");

    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("speaks Polish to a Polish account, marked with lang=pl", async () => {
    await renderAs("pl");

    expect(screen.getByRole("link", { name: "Prognozy i zamówienia klientów" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("list", { name: "Co obejmuje CPG" })).toBeTruthy();
    expect(screen.getByText(pl.home.tagline)).toBeTruthy();
  });

  it("shows the language-neutral loading shell until the request-time content streams", () => {
    const main = HomePage();
    const { fallback } = (main.props.children as { props: { fallback: ReactElement } }).props;

    expect(fallback.type).toBe(LoadingMessage);
    render(fallback);
    expect(document.querySelector("[aria-busy=true]")?.textContent).toBe("");
  });
});
