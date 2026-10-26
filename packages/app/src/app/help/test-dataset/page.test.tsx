import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingMessage } from "@cpg/ui/backend/feedback/loading-message";
import { resolveServerComponents } from "../../../../../../tests/setup/server-components";
import { en } from "../../../i18n/messages/en";
import { pl } from "../../../i18n/messages/pl";
import TestDatasetHelpPage, { metadata } from "./page";
import { PLANNING_WEEK } from "./planning-week";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

async function renderGuide(locale: "en" | "pl" = "en") {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
  return render(await resolveServerComponents(TestDatasetHelpPage()));
}

describe("TestDatasetHelpPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("draws one planning cycle as a flow from Thursday's run to the shipments, and says it repeats", async () => {
    const { container } = await renderGuide();

    expect(screen.getByRole("heading", { level: 1, name: "The Test dataset's planning week" })).toBeTruthy();
    const steps = [...container.querySelectorAll("[data-planning-cycle] > li")];
    expect(steps.map((step) => step.querySelector(".font-medium")?.textContent)).toEqual(["Planning run", "Steel arrives", "Supplies arrive", "Production", "Shipments"]);
    expect(steps[0].textContent).toContain("Thursday, week 1");
    // An arrow leads into every step but the first, and only the run that starts the cycle is outlined in primary.
    expect(steps.map((step) => step.querySelector("svg") !== null)).toEqual([false, true, true, true, true]);
    expect(steps.map((step) => step.querySelector(".border-primary") !== null)).toEqual([true, false, false, false, false]);
    expect(screen.getByText(en.help.planningWeek.repeat)).toBeTruthy();
    expect(mocks.connection).toHaveBeenCalledOnce();
  });

  it("marks the days a reset leaves a partly received purchase order, Friday to Tuesday, in the strip and in words", async () => {
    const { container } = await renderGuide();

    const strip = container.querySelector("[data-planning-strip]")!;
    expect(strip.getAttribute("aria-hidden")).toBe("true");
    const cells = [...strip.children];
    expect(cells.map((cell) => [cell.textContent, cell.getAttribute("data-partial")])).toEqual([
      ["Mon", "true"],
      ["Tue", "true"],
      ["Wed", "false"],
      ["Thu", "false"],
      ["Fri", "true"],
      ["Sat", "true"],
      ["Sun", "true"],
    ]);
    // The run on Thursday and the receipts on Monday and Tuesday carry an icon; the partial mark is toned by its answer.
    expect(cells.map((cell) => cell.querySelectorAll("svg").length)).toEqual([2, 2, 1, 2, 1, 1, 1]);
    expect(cells[0].querySelector(".bg-success-surface")).toBeTruthy();
    expect(cells[2].querySelector(".bg-neutral-surface")).toBeTruthy();

    const days = within(container.querySelector<HTMLElement>("[data-planning-days]")!).getAllByRole("listitem");
    expect(days.map((day) => day.querySelector(".font-medium")?.textContent)).toEqual(en.help.planningWeek.days.map(({ name }) => name));
    expect(days[2].textContent).toContain("None");
    expect(days[2].textContent).toContain("Both of Thursday's orders were received on Monday and Tuesday.");
    expect(days[4].textContent).toContain("Partly received purchase order");
    expect(screen.getByText(en.help.planningWeek.everyDay)).toBeTruthy();
  });

  it("explains why the datasets plan weekly and how to see a partial receipt", async () => {
    await renderGuide();

    const why = screen.getByRole("heading", { name: "Why weekly, at Thursday's run" }).closest("section")!;
    expect(why.textContent).toContain("about three times as many");
    expect(why.textContent).toContain("Ordering two weeks ahead");
    expect(why.textContent).toContain("reset Test on a day from Friday to Tuesday");
    expect(screen.getByRole("link", { name: "All help topics" }).getAttribute("href")).toBe("/help");
  });

  it("speaks Polish to a Polish account", async () => {
    await renderGuide("pl");

    expect(screen.getByRole("heading", { level: 1, name: "Tydzień planowania w zbiorze Test" }).closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByText("Przebieg planowania", { selector: ".font-medium" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wszystkie tematy pomocy" })).toBeTruthy();
  });

  it("names a day for every day of the week it draws, in both languages", () => {
    expect(PLANNING_WEEK).toHaveLength(7);
    expect(en.help.planningWeek.days).toHaveLength(7);
    expect(pl.help.planningWeek.days).toHaveLength(7);
  });

  it("shows the language-neutral loading shell until the request-time content streams", () => {
    const main = TestDatasetHelpPage();
    const { fallback } = (main.props.children as { props: { fallback: ReactElement } }).props;

    expect(fallback.type).toBe(LoadingMessage);
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("The Test dataset's planning week · Help · Caveman Planning Good");
  });
});
