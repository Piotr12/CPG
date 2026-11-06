import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpRunView } from "@cpg/core";
import { callApi, json } from "./api";
import { explanationSetup, type ExplanationIds } from "./mrp-explanations";
import { openBrowser, type Browser } from "./browser";
import { choosePreference, closeAccountMenu, signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: users are never deleted, and other files share the app.
const USERNAME = "mrprep-rita";
const PASSWORD = "mrprep rita's first password";
const SETUP_TOKEN = "mrprep-setup";

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
const PAIRS = "table[aria-label='Planned material–location pairs']";
const DAYS = "table[aria-label='Days of the plan']";
const WEEKS = "table[aria-label='Weeks of the plan']";
/** A column's horizontal extent in the viewport. */
type Box = { left: number; right: number };
/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// E18-S01 in a real browser: a normal user reads the latest MRP run's report on the MRP page, filters it
// to a pair and reads its days (MRP-005, MRP-008), in a read-only tenant too (TEN-018).
describe("the MRP report in the UI", () => {
  let admin: Browser;
  let rita: Browser;
  let secret: string;
  let run: MrpRunView;
  const ids: Record<"sheet" | "cabinet" | "plant" | "depot" | "yard" | "dock" | "po", string> = {} as never;
  let explained: ExplanationIds;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => {
    const response = await api("POST", path, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data.id as string;
  };
  const runMrp = async () => json(await api("POST", "/api/tenants/prod/mrp/runs", {})).data as MrpRunView;
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", { readOnly });
  /** Opens the Prod MRP page at `query` and waits until `selector` is shown. */
  const open = async (query: string, selector = PAIRS) => {
    await rita.open(`${baseUrl}/admin/prod/mrp${query}`);
    await rita.waitUntil(`Boolean(${shown(selector)})`);
  };
  /** The day table's figures on `date`, keyed by figure. */
  const figures = (date: string) =>
    rita.evaluate<Record<string, string>>(`(() => {
      const row = [...${shown(DAYS)}.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("[data-mrp-date]")?.textContent === ${JSON.stringify(date)});
      return Object.fromEntries([...row.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent]));
    })()`);

  beforeAll(async () => {
    [admin, rita] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    // E18-S03: the fallback, inactive-input, no-usable-BOM, provisional-chain and at-risk cases, at a site of their own,
    // first, so the cabinet below stays this file's newest material and its pair sorts last.
    explained = await explanationSetup({
      create,
      deactivate: async (id) => {
        const { version } = json(await api("GET", `/api/tenants/prod/materials/${id}`)).data as { version: number };
        const response = await api("PATCH", `/api/tenants/prod/materials/${id}`, { active: false, version });
        expect(response.status, response.text).toBe(200);
      },
    }, "mrprep");
    ids.sheet = await create("/api/tenants/prod/materials", { type: "raw", description: "mrprep sheet", baseUnit: "kg" });
    ids.cabinet = await create("/api/tenants/prod/materials", { type: "finished", description: "mrprep cabinet", baseUnit: "each" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "mrprep plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "mrprep depot" });
    ids.yard = await create("/api/tenants/prod/locations", { name: "mrprep yard" });
    const customer = await create("/api/tenants/prod/customers", { name: "mrprep retail" });
    // MRP-005: physical 50, Open lines of 10 and 15 two days apart. MRP-008: physical 5, an Open line of 20.
    await create("/api/tenants/prod/stock/corrections", { material: ids.sheet, location: ids.plant, quantity: "50", unit: "kg", reason: "mrprep count" });
    await create("/api/tenants/prod/stock/corrections", { material: ids.cabinet, location: ids.plant, quantity: "5", unit: "each", reason: "mrprep count" });
    await create("/api/tenants/prod/customer-orders", {
      customer,
      location: ids.plant,
      lines: [
        { material: ids.sheet, quantity: "10", unit: "kg", requiredDate: day(4) },
        { material: ids.sheet, quantity: "15", unit: "kg", requiredDate: day(6) },
        { material: ids.cabinet, quantity: "20", unit: "each", requiredDate: day(3) },
      ],
    });
    // #277: a planned transfer of 5 kg of sheet leaves the plant on day 8 and reaches the depot on day 9.
    await create("/api/tenants/prod/transfers", {
      material: ids.sheet, source: ids.plant, destination: ids.depot, quantity: "5", unit: "kg", plannedDispatch: day(8), plannedArrival: day(9),
    });
    // #278: sheet is bought at the yard in lots of at least 10, multiples of 5, and the yard needs 3 on day 5.
    await create("/api/tenants/prod/planning-parameters", { material: ids.sheet, location: ids.yard, procurement: "buy", leadTimeDays: 2, minimumQuantity: "10", lotMultiple: "5" });
    await create("/api/tenants/prod/customer-orders", { customer, location: ids.yard, lines: [{ material: ids.sheet, quantity: "3", unit: "kg", requiredDate: day(5) }] });
    // E18-S02: 30 kg of sheet ordered for the dock three days ago and not received: Overdue on the first day.
    ids.dock = await create("/api/tenants/prod/locations", { name: "mrprep dock" });
    const supplier = await create("/api/tenants/prod/suppliers", { name: "mrprep mill" });
    ids.po = await create("/api/tenants/prod/purchase-orders", { supplier, location: ids.dock, lines: [{ material: ids.sheet, quantity: "30", unit: "kg", plannedDate: day(-3) }] });
    run = await runMrp();
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(rita, baseUrl, PASSWORD, USERNAME);
    await rita.waitUntil(signedInAndHydrated(USERNAME));
    await rita.setViewport(1280, 800);
  });
  afterAll(async () => {
    try {
      // Later files write to Prod, and expect the admin to hold no tokens: revoke this file's with itself.
      expect((await setReadOnly(false)).status).toBe(200);
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    } finally {
      await Promise.all([admin, rita].map((browser) => browser.close()));
    }
  });

  it("shows a pair's days apart, each with its own demand and balance, filtered to the pair (MRP-005)", async () => {
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);

    expect(await rita.evaluate<string>(`${shown("[data-mrp-plan-heading]")}.textContent`)).toBe(`${ids.sheet} mrprep sheet at ${ids.plant} mrprep plant`);
    expect(await rita.evaluate<number>(`${shown(DAYS)}.querySelectorAll("tbody tr").length`)).toBe(90);
    expect(await figures(day(4))).toMatchObject({ firmDemand: "10", projectedBefore: "40", projectedAfter: "40", shortage: "0" });
    expect(await figures(day(5))).toMatchObject({ firmDemand: "0", projectedBefore: "40" });
    expect(await figures(day(6))).toMatchObject({ firmDemand: "15", projectedBefore: "25", shortage: "0" });
    expect(await rita.evaluate<string>(`${shown("[data-mrp-field=id]")}.textContent`)).toBe(run.id);
  });

  it("shows a planned transfer leaving the plant on its dispatch day and reaching the depot on its arrival day (#277)", async () => {
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
    expect(await figures(day(8))).toMatchObject({ transferOut: "5", transferIn: "0", projectedBefore: "20" });

    await open(`?material=${ids.sheet}&location=${ids.depot}`, DAYS);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-plan-heading]")}.textContent`)).toBe(`${ids.sheet} mrprep sheet at ${ids.depot} mrprep depot`);
    expect(await figures(day(8))).toMatchObject({ transferIn: "0", projectedBefore: "0" });
    expect(await figures(day(9))).toMatchObject({ transferOut: "0", transferIn: "5", projectedBefore: "5" });
  });

  it("shows a negative projected balance as a shortage while the stock itself stays 5 (MRP-008, INV-008)", async () => {
    await open(`?material=${ids.cabinet}&location=${ids.plant}`, DAYS);

    expect(await figures(day(3))).toMatchObject({ firmDemand: "20", projectedBefore: "-15", shortage: "15" });
    expect(await rita.evaluate<string>(`${shown("[data-mrp-first-shortage]")}.textContent`)).toBe(day(3));
    const stock = json(await api("GET", `/api/tenants/prod/reports/stock?material=${ids.cabinet}&location=${ids.plant}`)).data;
    expect(stock.rows.map((row: { quantity: string }) => row.quantity)).toEqual(["5.000000"]);
  });

  it("covers every planned pair unfiltered, 25 a page, and opens a pair's days from the list's last page", async () => {
    const latest = json(await api("GET", "/api/tenants/prod/mrp/runs/latest")).data as MrpLatestView;
    await open("");
    expect(await rita.evaluate<string>(`${shown("[data-mrp-pair-count]")}.textContent`)).toBe(`Planned pairs: ${latest.total}`);
    expect(latest.total).toBe(latest.run.pairs);
    expect(await rita.evaluate<number>(`${shown(PAIRS)}.querySelectorAll("tbody tr").length`)).toBe(Math.min(25, latest.total));
    expect(await rita.evaluate<boolean>(`Boolean(${shown(DAYS)})`)).toBe(latest.total === 1);

    // The cabinet is this file's newest material, so its pair sorts last of the run: the page past the end shows
    // the last page, which always holds it (lesson 2026-10-24, "Paging by ascending ID moves the row a test just
    // created off the first page"). The sheet pair may sit on the page before.
    await open("?page=1000000");
    await rita.clickRole("link", `Days of ${ids.cabinet} mrprep cabinet at ${ids.plant} mrprep plant`);
    await rita.waitUntil(`location.search === "?material=${ids.cabinet}&location=${ids.plant}" && Boolean(${shown(DAYS)})`);
    expect(await figures(day(3))).toMatchObject({ firmDemand: "20", projectedBefore: "-15" });
  });

  it("shows the balance after a proposal of 10 where the yard is 3 short, the balance before it unchanged (#278)", async () => {
    await open(`?material=${ids.sheet}&location=${ids.yard}`, DAYS);

    expect(await figures(day(4))).toMatchObject({ projectedBefore: "0", projectedAfter: "0" });
    expect(await figures(day(5))).toMatchObject({ firmDemand: "3", projectedBefore: "-3", projectedAfter: "7", shortage: "3" });
    expect(await figures(day(30))).toMatchObject({ projectedBefore: "-3", projectedAfter: "7" });
  });

  it("switches one pair's days to weeks that sum its demand and keep each week's last balance, and back, as the API folds them (UX-019, UX-027)", async () => {
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
    await rita.clickRole("radio", "Week");
    await rita.clickRole("button", "Apply");
    await rita.waitUntil(`new URLSearchParams(location.search).get("bucket") === "week" && Boolean(${shown(WEEKS)})`);

    const [plan] = (json(await api("GET", `/api/tenants/prod/mrp/runs/latest?material=${ids.sheet}&location=${ids.plant}&bucket=week`)).data as MrpLatestView).plans;
    const shownWeeks = await rita.evaluate<Record<string, string>[]>(`[...${shown(WEEKS)}.querySelectorAll("tbody tr")].map((tr) => Object.fromEntries([...tr.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent])))`);
    expect(shownWeeks).toHaveLength(plan.weeks!.length);
    expect(shownWeeks.map(({ firmDemand, projectedBefore, lowestProjectedBefore, peakShortage }) => [firmDemand, projectedBefore, lowestProjectedBefore, peakShortage].map(Number))).toEqual(
      plan.weeks!.map(({ firmDemand, projectedBefore, lowestProjectedBefore, peakShortage }) => [firmDemand, projectedBefore, lowestProjectedBefore, peakShortage].map(Number)),
    );
    // MRP-005's 10 and 15 are summed, and each week's balance is its last day's, never a sum.
    expect(shownWeeks.reduce((sum, week) => sum + Number(week.firmDemand), 0)).toBe(25);
    for (const week of plan.weeks!) expect(week.projectedBefore).toBe(plan.buckets.find(({ date }) => date === week.end)!.projectedBefore);

    await rita.clickRole("radio", "Day");
    await rita.clickRole("button", "Apply");
    await rita.waitUntil(`new URLSearchParams(location.search).get("bucket") === "day" && Boolean(${shown(DAYS)})`);
    expect(await rita.evaluate<number>(`${shown(DAYS)}.querySelectorAll("tbody tr").length`)).toBe(90);
  });

  it("marks the overdue purchase-order line on the first day and in the first week, filtered to its pair (UX-018, MRP-015)", async () => {
    const mark = (table: string) => rita.evaluate<string>(`${shown(table)}.querySelector("tbody tr [data-mrp-mark=overdue-supply]")?.textContent ?? ""`);
    await open(`?material=${ids.sheet}&location=${ids.dock}`, DAYS);
    expect(await rita.evaluate<string>(`${shown(DAYS)}.querySelector("tbody tr [data-mrp-date]").textContent`)).toBe(day(0));
    const text = await mark(DAYS);
    expect(text).toMatch(new RegExp(`^Overdue · PO ${ids.po}/1 · due .+ · 30 kg$`));
    expect(await figures(day(0))).toMatchObject({ dependableSupply: "30", projectedBefore: "30" });

    await open(`?material=${ids.sheet}&location=${ids.dock}&bucket=week`, WEEKS);
    expect(await mark(WEEKS)).toBe(text);
    expect(await rita.evaluate<boolean>(`${shown(WEEKS)}.querySelector("[data-slot=status-badge][data-tone=warning] svg") !== null`)).toBe(true);
  });

  it("is the not-found state for a material or location this tenant doesn't have", async () => {
    for (const query of ["?material=99999999", "?location=99999999"]) {
      await rita.open(`${baseUrl}/admin/prod/mrp${query}`);
      await rita.waitForText("Page not found.");
    }
    expect(await rita.evaluate<boolean>(`Boolean(${shown(PAIRS)})`)).toBe(false);
  });

  it("shows a later run in place of the earlier one (PRD §04, until superseded)", async () => {
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-field=id]")}.textContent`)).toBe(run.id);

    const next = await runMrp();
    await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);

    expect(next.id).not.toBe(run.id);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-field=id]")}.textContent`)).toBe(next.id);
    expect(await figures(day(6))).toMatchObject({ firmDemand: "15", projectedBefore: "25" });
  });

  it("stays readable to a normal user while the tenant is read-only (TEN-018)", async () => {
    expect((await setReadOnly(true)).status).toBe(200);
    try {
      await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
      expect(await figures(day(4))).toMatchObject({ firmDemand: "10", projectedBefore: "40" });
      expect(await rita.evaluate<boolean>(`Boolean(${shown("main button[data-mrp-run]")})`)).toBe(false);
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });

  it("explains the run on the page: Why this BOM, provisional plans with no Accept, at-risk orders and the at-risk column, and exceptions in English and Polish (E18-S03, UX-020, MRP-047, MRP-050, MRP-051, LFC-026)", async () => {
    const x = explained;
    const EXPLANATIONS = "[data-mrp-explanations]";
    await open(`?location=${x.site}`, EXPLANATIONS);

    const lists = await rita.evaluate<{ callout: string; provisional: string[]; accept: number; link: string | null; atRisk: string; codes: string[]; parent: string }>(`(() => {
      const section = ${shown(EXPLANATIONS)};
      const provisional = section.querySelector("[data-mrp-provisional]");
      return {
        callout: provisional.querySelector("[data-slot=callout]").textContent,
        provisional: [...provisional.querySelectorAll("tbody tr")].map((row) => row.textContent),
        accept: [...provisional.querySelectorAll("button")].filter((button) => /Accept/.test(button.textContent)).length,
        link: provisional.querySelector('[data-mrp-provisional-component="${x.v}"] a')?.getAttribute("href") ?? null,
        atRisk: section.querySelector("[data-mrp-at-risk] tbody tr").textContent,
        codes: [...section.querySelectorAll("[data-mrp-exceptions] [data-mrp-exception-code]")].map((cell) => cell.getAttribute("data-mrp-exception-code")),
        parent: [...section.querySelectorAll("[data-mrp-exceptions] tbody tr")].find((row) => row.querySelector('[data-mrp-exception-code="MISSING_USABLE_BOM"]')).textContent,
      };
    })()`);
    // MRP-047: P and I, provisional and labelled so, with nothing to accept; I's component V opens V's own pair.
    expect(lists.callout).toContain("Provisional — not executable");
    expect(lists.provisional).toHaveLength(2);
    expect(lists.provisional[0]).toContain("Provisional");
    expect(lists.provisional[0]).toContain("mrprep cabinet p");
    expect(lists.provisional[1]).toContain("mrprep frame i");
    expect(lists.provisional[1]).toContain(`${x.v} mrprep steel v 10 each`);
    expect(lists.accept).toBe(0);
    expect(lists.link).toBe(`/admin/prod/mrp?material=${x.v}&location=${x.site}`);
    // MRP-051: the order, its unproduced balance, its inactive U and the label.
    for (const part of [x.order, "10 each", `${x.u} mrprep glaze u`, "At-Risk Existing Production / Inactive BOM Component"]) expect(lists.atRisk).toContain(part);
    // LFC-026 and the parent planning exception, each naming the BOM it rejected and why.
    // P is short only of I, which MRP can make, so I is sized for real demand and raises its own No Feasible BOM (#369).
    expect(lists.codes.sort()).toEqual(["MISSING_USABLE_BOM", "NO_FEASIBLE_BOM", "NO_FEASIBLE_BOM"]);
    expect(lists.parent).toContain(`BOM ${x.hBom} / revision 1 — Inactive BOM Component: ${x.t} mrprep retired t`);

    // UX-020: F's proposal names priority 2, and Why this BOM shows priority 1's exact shortage of A in A's unit.
    const WHY = "[data-mrp-why-bom] button";
    await open(`?material=${x.f}&location=${x.site}`, WHY);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-proposal-bom]")}.textContent`)).toBe(`BOM ${x.fSecond} / revision 1`);
    await rita.waitUntil(`Object.keys(${shown(WHY)}).some((key) => key.startsWith("__reactFiber"))`);
    await rita.click(WHY);
    await rita.waitUntil(`Boolean(${shown("[data-mrp-shortage]")})`);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-rejections] > li")}.firstChild.textContent`)).toBe(`BOM ${x.fFirst} / revision 1 — Component shortage`);
    expect(await rita.evaluate<string>(`${shown("[data-mrp-shortage]")}.textContent`)).toBe(`${x.a} mrprep sugar a: needs 6 each, dependable 5 each, short 1 each`);

    // MRP-051: W's day shows the order's output as at-risk supply, apart from dependable supply, and the shortage it was to cover.
    await open(`?material=${x.w}&location=${x.site}`, DAYS);
    expect(await figures(day(8))).toMatchObject({ dependableSupply: "0", atRiskSupply: "10" });
    expect(await figures(day(12))).toMatchObject({ shortage: "10" });

    // D03: the same lists in Polish.
    await rita.open(`${baseUrl}/admin`);
    await rita.waitUntil(signedInAndHydrated(USERNAME));
    await choosePreference(rita, "pl");
    await closeAccountMenu(rita);
    try {
      await open(`?location=${x.site}`, EXPLANATIONS);
      expect(await rita.evaluate<string>(`${shown(EXPLANATIONS)}.querySelector("h3").textContent`)).toBe("Wyjaśnienia");
      expect(await rita.evaluate<string>(`${shown('[data-mrp-exception-code="MISSING_USABLE_BOM"]')}.textContent`)).toBe("Brak używalnego BOM-u");
      expect(await rita.evaluate<string>(`${shown("[data-mrp-provisional] [data-slot=callout]")}.textContent`)).toContain("Tymczasowe — niewykonalne");
    } finally {
      await rita.open(`${baseUrl}/admin`);
      await rita.waitUntil(signedInAndHydrated(USERNAME));
      await choosePreference(rita, "en");
      await closeAccountMenu(rita);
    }
  });

  it("keeps the page itself from scrolling sideways at 1280 and 390 px; the day and week tables scroll in their own region", async () => {
    try {
      for (const [width, height] of [[1280, 800], [390, 844]]) {
        await rita.setViewport(width, height);
        await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
        expect(await rita.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`), `${width} px`).toBe(true);
        // Twelve figures since E18-S03's At-risk supply, beside the date, the warnings and, since #380, the short requirements.
        expect(await rita.evaluate<number>(`${shown(DAYS)}.querySelectorAll("thead th").length`)).toBe(15);
        await open(`?material=${ids.sheet}&location=${ids.plant}&bucket=week`, WEEKS);
        expect(await rita.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`), `${width} px, by week`).toBe(true);
      }
    } finally {
      await rita.setViewport(1280, 800);
    }
  });

  /**
   * Measures the one-pair table `selector` in its scroll region (#311): its date and the two pinned figures
   * scrolled to the start, the middle and the end; every figure before the pinned pair centred in the gap
   * between the date and the pair; and every column after it at the end of the scroll.
   */
  const measurePinned = (selector: string, pinned: [string, string]) =>
    rita.evaluate<{
      sticky: boolean[];
      positions: { region: Box; columns: (Box & { onTop: boolean })[] }[];
      gaps: (Box & { name: string; date: number; pin: number })[];
      ends: (Box & { name: string; onTop: boolean })[];
    }>(`(() => {
      const table = ${shown(selector)};
      const region = table.closest("[data-slot=table-container]");
      const heads = [...table.querySelectorAll("thead th")];
      const cells = [...table.querySelector("tbody tr").cells];
      const [first, second] = ${JSON.stringify(pinned)}.map((figure) => cells.findIndex((cell) => cell.querySelector("[data-mrp-figure=" + figure + "]")));
      const box = (element) => { const { left, right } = element.getBoundingClientRect(); return { left, right }; };
      const onTop = (element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
      };
      region.scrollLeft = 0;
      heads[0].scrollIntoView({ block: "center" });
      const max = region.scrollWidth - region.clientWidth;
      const positions = [0, max / 2, max].map((scroll) => {
        region.scrollLeft = scroll;
        return { region: box(region), columns: [0, first, second].flatMap((i) => [{ ...box(heads[i]), onTop: onTop(heads[i]) }, { ...box(cells[i]), onTop: onTop(cells[i]) }]) };
      });
      const gaps = heads.slice(1, first).map((head) => {
        region.scrollLeft = 0;
        const { left, right } = head.getBoundingClientRect();
        region.scrollLeft = (left + right) / 2 - (heads[0].getBoundingClientRect().right + heads[first].getBoundingClientRect().left) / 2;
        return { name: head.textContent, ...box(head), date: heads[0].getBoundingClientRect().right, pin: heads[first].getBoundingClientRect().left };
      });
      region.scrollLeft = max;
      const ends = heads.slice(first + 1).filter((head) => head !== heads[second]).map((head) => ({ name: head.textContent, ...box(head), onTop: onTop(head) }));
      region.scrollLeft = 0;
      return { sticky: [first, second].map((i) => getComputedStyle(heads[i]).position === "sticky"), positions, gaps, ends };
    })()`);
  /** Asserts what {@link measurePinned} measured: the three columns in view, in order and on top, every other one reachable. */
  const expectPinned = async (selector: string, pinned: [string, string], gaps: number, ends: string[], label: string) => {
    const measured = await measurePinned(selector, pinned);
    expect(measured.sticky, label).toEqual([true, true]);
    for (const [at, { region, columns }] of measured.positions.entries()) {
      for (const column of columns) {
        expect(column.left, `${label}, position ${at}`).toBeGreaterThanOrEqual(region.left - 1);
        expect(column.right, `${label}, position ${at}`).toBeLessThanOrEqual(region.right + 1);
        expect(column.onTop, `${label}, position ${at}`).toBe(true);
      }
      const [date, , before, , after] = columns;
      expect(date.right, `${label}, position ${at}`).toBeLessThanOrEqual(before.left + 1);
      expect(before.right, `${label}, position ${at}`).toBeLessThanOrEqual(after.left + 1);
      // Scrolled to the start both are stuck, so they touch: nothing scrolling shows between them.
      if (at === 0) expect(after.left - before.right, label).toBeLessThanOrEqual(1);
    }
    expect(measured.gaps.length, label).toBe(gaps);
    for (const gap of measured.gaps) {
      expect(gap.left, `${label}: ${gap.name}`).toBeGreaterThanOrEqual(gap.date - 1);
      expect(gap.right, `${label}: ${gap.name}`).toBeLessThanOrEqual(gap.pin + 1);
    }
    expect(measured.ends.map(({ name }) => name), label).toEqual(ends);
    const { region } = measured.positions[2];
    for (const end of measured.ends) {
      expect(end.onTop, `${label}: ${end.name}`).toBe(true);
      expect(end.left, `${label}: ${end.name}`).toBeGreaterThanOrEqual(region.left - 1);
      expect(end.right, `${label}: ${end.name}`).toBeLessThanOrEqual(region.right + 1);
    }
  };

  it("keeps the date, Projected before proposals and Shortage in view at 1280 px beside the expanded menu, however far the day table scrolls, in English and Polish; every other figure stays reachable (#311)", async () => {
    try {
      await rita.setViewport(1280, 800);
      await open(`?material=${ids.sheet}&location=${ids.plant}`, DAYS);
      expect(await rita.evaluate<boolean>(`Boolean(document.querySelector("[data-slot=sidebar][data-state=expanded]"))`)).toBe(true);
      // The table is still wider than its region, so this proves the pinning, not a table that fits.
      expect(await rita.evaluate<boolean>(`(() => { const region = ${shown(DAYS)}.closest("[data-slot=table-container]"); return region.scrollWidth > region.clientWidth; })()`)).toBe(true);
      await expectPinned(DAYS, ["projectedBefore", "shortage"], 9, ["Projected after proposals", "Warnings", "Short requirements"], "day");
      // Spec Q2: the week's lowest balance and peak shortage, pinned the same way.
      await open(`?material=${ids.sheet}&location=${ids.plant}&bucket=week`, WEEKS);
      await expectPinned(WEEKS, ["lowestProjectedBefore", "peakShortage"], 11, ["Warnings"], "week");

      await rita.open(`${baseUrl}/admin`);
      await rita.waitUntil(signedInAndHydrated(USERNAME));
      await choosePreference(rita, "pl");
      await closeAccountMenu(rita);
      const dni = "table[aria-label='Dni planu']";
      await open(`?material=${ids.sheet}&location=${ids.plant}`, dni);
      await expectPinned(dni, ["projectedBefore", "shortage"], 9, ["Prognozowany stan po propozycjach", "Ostrzeżenia", "Niepokryte potrzeby"], "day, Polish");

      // Spec Q3: at 390 px only the date sticks, so the figures keep the region's width to scroll in.
      await rita.setViewport(390, 844);
      await open(`?material=${ids.sheet}&location=${ids.plant}`, dni);
      expect((await measurePinned(dni, ["projectedBefore", "shortage"])).sticky).toEqual([false, false]);
      expect(await rita.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    } finally {
      await rita.setViewport(1280, 800);
      await rita.open(`${baseUrl}/admin`);
      await rita.waitUntil(signedInAndHydrated(USERNAME));
      await choosePreference(rita, "en");
      await closeAccountMenu(rita);
    }
  });

  it("explains every column in the help, found by “MRP” in English and by “MRP” and “planowanie” in Polish (D03)", async () => {
    await rita.open(`${baseUrl}/help?q=MRP`);
    await rita.waitFor("section#mrp");
    const english = await rita.text("section#mrp");
    for (const words of ["firm demand", "forecast demand", "dependent demand", "transfer out", "safety stock", "tentative supply", "dependable supply", "transfer in", "before and after", "shortage", "a projected balance of 40"]) {
      expect(english).toContain(words);
    }

    await rita.open(`${baseUrl}/admin`);
    await rita.waitUntil(signedInAndHydrated(USERNAME));
    await choosePreference(rita, "pl");
    await closeAccountMenu(rita);
    for (const query of ["MRP", "planowanie"]) {
      await rita.open(`${baseUrl}/help?q=${query}`);
      await rita.waitFor("section#mrp");
      expect(await rita.text("section#mrp h2")).toBe("Planowanie MRP");
    }
    expect(await rita.text("section#mrp")).toContain("popyt pewny");
  });
});
