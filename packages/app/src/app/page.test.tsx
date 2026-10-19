import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../tests/setup/server-components";
import { en } from "../i18n/messages/en";
import { pl } from "../i18n/messages/pl";
import HomePage from "./page";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

async function renderAs(locale: "en" | "pl") {
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

  it("lists the four MRP II steps in order, numbered", async () => {
    await renderAs("en");

    const steps = screen.getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector("h2")?.textContent)).toEqual([
      "Demand Forecast",
      "Bill of Materials",
      "Production Planning",
      "Production Execution",
    ]);
    expect(steps.map((step) => step.querySelector("p")?.textContent)).toEqual(["01", "02", "03", "04"]);
  });

  it("leaves the footer to the layout: its motto is a plain paragraph", async () => {
    await renderAs("en");

    expect(screen.getByText("Demand come. Caveman plan. Caveman make.").tagName).toBe("P");
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("speaks Polish to a Polish account, marked with lang=pl", async () => {
    await renderAs("pl");

    expect(screen.getByText("Prognoza popytu").closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("Popyt przyjść. Jaskiniowiec planować. Jaskiniowiec robić.")).toBeTruthy();
  });

  it("holds no text in its static fallback", () => {
    const main = HomePage();
    const fallback = (main.props.children as { props: { fallback: { props: Record<string, unknown> } } }).props.fallback;

    expect(fallback.props["aria-busy"]).toBe("true");
    expect(fallback.props.children).toBeUndefined();
  });
});
