import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpPlanView, MrpRunView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own token and records: other files share the app and its Prod tenant (lesson 2026-10-22).
const TOKEN = "mrpsup-admin";
const ZERO = "0.000000";
const DAYS = "table[aria-label='Days of the plan']";
const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
/** A plan's days with any supply, by day index: `[dependable, tentative]`. Every other day has none. */
const supplyOf = (plan: MrpPlanView) =>
  Object.fromEntries(plan.buckets.flatMap(({ dependableSupply, tentativeSupply }, index) => (dependableSupply === ZERO && tentativeSupply === ZERO ? [] : [[index, [dependableSupply, tentativeSupply]]])));
/** The distinct projected balances before proposals over a plan's 90 days. */
const balancesOf = (plan: MrpPlanView) => [...new Set(plan.buckets.map(({ projectedBefore }) => projectedBefore))];

type Line = { line: number; status: string; quantity: string; received: string; abandoned: string; outstanding: string; plannedDate: string; requisition: string | null };
type Versioned = { id: string; version: number };

// #310: the purchasing-supply rows E15-S02 (#276) left Partially verified, read through the report E18-S01 (#284)
// added: each row's documents built in Prod through the API, one MRP run, then each pair's days read through
// GET …/mrp/runs/latest and on the MRP page's day table, which must show the same figures on all 90 days.
describe("purchasing supply in the MRP report", () => {
  let admin: Browser;
  let secret: string;
  let run: MrpRunView;
  let plant: string;
  let supplier: string;
  const ids = {} as Record<
    "direct" | "closed" | "reopened" | "revised" | "converted" | "partial" | "split" | "cancelled" | "resin" | "lines" | "board" | "frame",
    string
  > & {
    closedPo: string; reopenedPo: string; directPo: string; revisedPo: string; linesPo: string; boardPo: string;
    requisition: string; splitRequisition: string; cancelledRequisition: string; convertedPo: string; production: string;
  };

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const created = async <T = Versioned>(path: string, body: unknown) => {
    const response = await api("POST", path, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data as T;
  };
  const read = async <T = Versioned>(path: string) => {
    const response = await api("GET", path);
    expect(response.status, response.text).toBe(200);
    return json(response).data as T;
  };
  /** Posts `path` with the version `document` holds now. */
  const atVersion = async (document: string, path: string, body: Record<string, unknown> = {}) => {
    const { version } = await read(document);
    const response = await api("POST", path, { version, ...body });
    expect(response.status, response.text).toBe(200);
  };
  const material = async (description: string, type = "raw", baseUnit = "kg") => (await created("/api/tenants/prod/materials", { type, description, baseUnit })).id;
  const order = async (lines: { material: string; quantity: string; plannedDate: string; requisition?: string }[]) =>
    (await created("/api/tenants/prod/purchase-orders", { supplier, location: plant, lines: lines.map((line) => ({ unit: "kg", ...line })) })).id;
  const requisition = (of: string, quantity: string, requiredDate: string) =>
    created("/api/tenants/prod/purchase-requisitions", { material: of, location: plant, quantity, unit: "kg", requiredDate });
  const receive = (purchaseOrder: string, lines: { line: number; quantity: string }[]) =>
    created<{ lines: { movementId: string }[] }>("/api/tenants/prod/goods-receipts", { purchaseOrder, lines: lines.map((line) => ({ unit: "kg", ...line })) });
  const stock = async (of: string) => (await read<{ quantity: string }>(`/api/tenants/prod/stock?material=${of}&location=${plant}`)).quantity;
  const linesOf = async (po: string) => (await read<{ lines: Line[] }>(`/api/tenants/prod/purchase-orders/${po}`)).lines;
  /** The latest run's report for `of` at the plant, through the API: this file's run, one pair. */
  const report = async (of: string) => {
    const view = await read<MrpLatestView>(`/api/tenants/prod/mrp/runs/latest?material=${of}&location=${plant}`);
    expect(view.run.id).toBe(run.id);
    return view;
  };
  const planOf = async (of: string) => {
    const view = await report(of);
    expect(view.total).toBe(1);
    const [plan] = view.plans;
    expect(plan.buckets).toHaveLength(90);
    expect(plan.buckets[0].date).toBe(day(0));
    // None of this file's pairs has at-risk supply, a transfer or a proposal: dependable and tentative are all its supply.
    expect(plan.buckets.every(({ atRiskSupply, transferIn, proposedReceipts }) => [atRiskSupply, transferIn, proposedReceipts].every((figure) => figure === ZERO))).toBe(true);
    return plan;
  };
  /**
   * Opens the pair's days on the MRP page, and checks that every one of its 90 rows shows the API's figures
   * (the screen shows them without trailing zeros). Returns the screen's rows by date, for the row's own checks.
   */
  const onScreen = async (plan: MrpPlanView) => {
    await admin.open(`${baseUrl}/admin/prod/mrp?material=${plan.material}&location=${plan.location}`);
    await admin.waitUntil(`Boolean(${shown(DAYS)})`);
    expect(await admin.evaluate<string>(`${shown("[data-mrp-plan-heading]")}.textContent`)).toBe(`${plan.material} ${plan.materialDescription} at ${plant} mrpsup plant`);
    expect(await admin.evaluate<string>(`${shown("[data-mrp-field=id]")}.textContent`)).toBe(run.id);
    const rows = await admin.evaluate<Record<string, string>[]>(`[...${shown(DAYS)}.querySelectorAll("tbody tr")].map((tr) => ({
      date: tr.querySelector("[data-mrp-date]").textContent,
      ...Object.fromEntries([...tr.querySelectorAll("[data-mrp-figure]")].map((cell) => [cell.getAttribute("data-mrp-figure"), cell.textContent])),
    }))`);
    const figures = Object.keys(rows[0]).filter((key) => key !== "date");
    expect(figures).toEqual(expect.arrayContaining(["dependentDemand", "tentativeSupply", "dependableSupply", "projectedBefore", "shortage"]));
    const numbers = (row: Record<string, string>) => ({ date: row.date, ...Object.fromEntries(figures.map((key) => [key, Number(row[key])])) });
    expect(rows.map(numbers)).toEqual(plan.buckets.map((bucket) => numbers(bucket as unknown as Record<string, string>)));
    return new Map(rows.map((row) => [row.date, row]));
  };

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, TOKEN);
    await admin.setViewport(1280, 800);
    plant = (await created("/api/tenants/prod/locations", { name: "mrpsup plant" })).id;
    supplier = (await created("/api/tenants/prod/suppliers", { name: "mrpsup mill" })).id;

    // BUY-002: a direct order of 100, no requisition, due on day 5.
    ids.direct = await material("mrpsup direct sheet");
    ids.directPo = await order([{ material: ids.direct, quantity: "100", plannedDate: day(5) }]);
    // BUY-017, MRP-014: 100 ordered for day 6, 60 received, the line Closed Early.
    ids.closed = await material("mrpsup closed sheet");
    ids.closedPo = await order([{ material: ids.closed, quantity: "100", plannedDate: day(6) }]);
    await receive(ids.closedPo, [{ line: 1, quantity: "60" }]);
    await atVersion(`/api/tenants/prod/purchase-orders/${ids.closedPo}`, `/api/tenants/prod/purchase-orders/${ids.closedPo}/close-early`, { lines: [1] });
    // The same, then the 60's receipt reversed: the line stays Closed Early with 60 left by arithmetic, which only
    // its status keeps out of supply (lesson 2026-10-27). 5 on hand make it a planned pair.
    ids.reopened = await material("mrpsup reopened sheet");
    await created("/api/tenants/prod/stock/corrections", { material: ids.reopened, location: plant, quantity: "5", unit: "kg", reason: "mrpsup count" });
    ids.reopenedPo = await order([{ material: ids.reopened, quantity: "100", plannedDate: day(6) }]);
    const reopened = await receive(ids.reopenedPo, [{ line: 1, quantity: "60" }]);
    await atVersion(`/api/tenants/prod/purchase-orders/${ids.reopenedPo}`, `/api/tenants/prod/purchase-orders/${ids.reopenedPo}/close-early`, { lines: [1] });
    await created(`/api/tenants/prod/stock/movements/${reopened.lines[0].movementId}/reverse`, { reason: "mrpsup reversal" });
    // BUY-024: 100 ordered for day 8, 30 received, the open 70 moved to day 12.
    ids.revised = await material("mrpsup revised sheet");
    ids.revisedPo = await order([{ material: ids.revised, quantity: "100", plannedDate: day(8) }]);
    await receive(ids.revisedPo, [{ line: 1, quantity: "30" }]);
    const { version } = await read(`/api/tenants/prod/purchase-orders/${ids.revisedPo}`);
    const moved = await api("PATCH", `/api/tenants/prod/purchase-orders/${ids.revisedPo}`, { version, lines: [{ line: 1, plannedDate: day(12) }] });
    expect(moved.status, moved.text).toBe(200);
    // BUY-026: a requisition of 100 converted entirely into an order of 100, nothing received.
    ids.converted = await material("mrpsup converted sheet");
    ids.requisition = (await requisition(ids.converted, "100", day(9))).id;
    ids.convertedPo = await order([{ material: ids.converted, quantity: "100", plannedDate: day(9), requisition: ids.requisition }]);
    // MRP-010: 100 ordered for day 10, 40 received.
    ids.partial = await material("mrpsup partial sheet");
    await receive(await order([{ material: ids.partial, quantity: "100", plannedDate: day(10) }]), [{ line: 1, quantity: "40" }]);
    // MRP-012: a requisition of 100 for day 14, 60 of it converted into an order line for day 11.
    ids.split = await material("mrpsup split sheet");
    ids.splitRequisition = (await requisition(ids.split, "100", day(14))).id;
    await order([{ material: ids.split, quantity: "60", plannedDate: day(11), requisition: ids.splitRequisition }]);
    // MRP-013, BUY-018: a requisition, a purchase order and a production order of the panel, all cancelled before
    // anything was processed. 10 on hand make the panel a planned pair.
    ids.cancelled = await material("mrpsup cancelled panel", "intermediate");
    ids.resin = await material("mrpsup resin");
    await created("/api/tenants/prod/stock/corrections", { material: ids.cancelled, location: plant, quantity: "10", unit: "kg", reason: "mrpsup count" });
    await created("/api/tenants/prod/planning-parameters", { material: ids.cancelled, location: plant, procurement: "make", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    await created("/api/tenants/prod/boms", { output: ids.cancelled, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: ids.resin, quantity: "1", unit: "kg" }] });
    ids.cancelledRequisition = (await requisition(ids.cancelled, "100", day(7))).id;
    const cancelledPr = `/api/tenants/prod/purchase-requisitions/${ids.cancelledRequisition}`;
    await atVersion(cancelledPr, `${cancelledPr}/cancel`);
    const cancelledPo = await order([{ material: ids.cancelled, quantity: "100", plannedDate: day(7) }]);
    await atVersion(`/api/tenants/prod/purchase-orders/${cancelledPo}`, `/api/tenants/prod/purchase-orders/${cancelledPo}/cancel`);
    const cancelledMo = (await created("/api/tenants/prod/production-orders", { output: ids.cancelled, location: plant, quantity: "50", unit: "kg", plannedFinish: day(7) })).id;
    await atVersion(`/api/tenants/prod/production-orders/${cancelledMo}`, `/api/tenants/prod/production-orders/${cancelledMo}/cancel`);
    // LFC-024: one order of two lines, the first received in full (Completed), the second 30 of 50 and Closed Early (20 abandoned).
    ids.lines = await material("mrpsup two-line sheet");
    ids.linesPo = await order([{ material: ids.lines, quantity: "50", plannedDate: day(15) }, { material: ids.lines, quantity: "50", plannedDate: day(16) }]);
    await receive(ids.linesPo, [{ line: 1, quantity: "50" }, { line: 2, quantity: "30" }]);
    await atVersion(`/api/tenants/prod/purchase-orders/${ids.linesPo}`, `/api/tenants/prod/purchase-orders/${ids.linesPo}/close-early`, { lines: [2] });
    // MRP-042: a production order of 20 frames finishing on day 20 starts on day 18 (lead time 2) and needs 40 kg of board
    // that day (2 kg a frame); an order for 40 kg of board is due the same day. No board is on hand.
    ids.board = await material("mrpsup board");
    ids.frame = await material("mrpsup frame", "intermediate", "each");
    await created("/api/tenants/prod/planning-parameters", { material: ids.frame, location: plant, procurement: "make", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    await created("/api/tenants/prod/boms", { output: ids.frame, priority: 1, validFrom: day(-30), validThrough: null, components: [{ material: ids.board, quantity: "2", unit: "kg" }] });
    ids.production = (await created("/api/tenants/prod/production-orders", { output: ids.frame, location: plant, quantity: "20", unit: "each", plannedFinish: day(20) })).id;
    ids.boardPo = await order([{ material: ids.board, quantity: "40", plannedDate: day(18) }]);

    run = await created<MrpRunView>("/api/tenants/prod/mrp/runs", {});
  });
  afterAll(async () => {
    try {
      // Later files expect the admin to hold no tokens: revoke this file's with itself.
      if (secret) {
        const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === TOKEN)!;
        expect((await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() })).status).toBe(200);
      }
    } finally {
      await admin.close();
    }
  });

  it("counts a direct order with no requisition as dependable supply of 100 on its planned day (BUY-002)", async () => {
    expect(await linesOf(ids.directPo)).toMatchObject([{ status: "open", quantity: "100.000000", requisition: null }]);

    const plan = await planOf(ids.direct);

    expect(supplyOf(plan)).toEqual({ 5: ["100.000000", ZERO] });
    expect(plan.buckets[4].projectedBefore).toBe(ZERO);
    expect(plan.buckets[5].projectedBefore).toBe("100.000000");
    const days = await onScreen(plan);
    expect(days.get(day(5))).toMatchObject({ dependableSupply: "100", tentativeSupply: "0", projectedBefore: "100" });
  });

  it("projects no remaining 40 of a line Closed Early after 60 of 100 were received, and keeps the 60 in stock (BUY-017, MRP-014)", async () => {
    expect(await linesOf(ids.closedPo)).toMatchObject([{ status: "closed-early", received: "60.000000", abandoned: "40.000000", outstanding: ZERO }]);
    expect(await stock(ids.closed)).toBe("60.000000");

    const plan = await planOf(ids.closed);

    expect(supplyOf(plan)).toEqual({});
    expect(balancesOf(plan)).toEqual(["60.000000"]);
    const days = await onScreen(plan);
    expect(days.get(day(6))).toMatchObject({ dependableSupply: "0", tentativeSupply: "0", projectedBefore: "60" });

    // With the receipt reversed, the 60 the line still lacks by arithmetic is not supply either: it is Closed Early.
    expect(await linesOf(ids.reopenedPo)).toMatchObject([{ status: "closed-early", quantity: "100.000000", received: ZERO, abandoned: "40.000000" }]);
    expect(await stock(ids.reopened)).toBe("5.000000");
    const reopened = await planOf(ids.reopened);
    expect(supplyOf(reopened)).toEqual({});
    expect(balancesOf(reopened)).toEqual(["5.000000"]);
    expect((await onScreen(reopened)).get(day(6))).toMatchObject({ dependableSupply: "0", projectedBefore: "5" });
  });

  it("counts no tentative supply from a cancelled requisition, nor any supply from a cancelled order or production order (BUY-018, MRP-013)", async () => {
    expect(await read(`/api/tenants/prod/purchase-requisitions/${ids.cancelledRequisition}`)).toMatchObject({ status: "cancelled", converted: ZERO });

    const plan = await planOf(ids.cancelled);

    expect(supplyOf(plan)).toEqual({});
    expect(balancesOf(plan)).toEqual(["10.000000"]);
    // The cancelled production order needs nothing either: its resin is planned nowhere.
    expect((await report(ids.resin)).total).toBe(0);
    const days = await onScreen(plan);
    expect(days.get(day(7))).toMatchObject({ dependableSupply: "0", tentativeSupply: "0", projectedBefore: "10" });
  });

  it("projects a partly received line's open 70 on its revised planned day, not its first one (BUY-024)", async () => {
    expect(await linesOf(ids.revisedPo)).toMatchObject([{ status: "open", received: "30.000000", outstanding: "70.000000", plannedDate: day(12) }]);

    const plan = await planOf(ids.revised);

    expect(supplyOf(plan)).toEqual({ 12: ["70.000000", ZERO] });
    expect(plan.buckets[11].projectedBefore).toBe("30.000000");
    expect(plan.buckets[12].projectedBefore).toBe("100.000000");
    const days = await onScreen(plan);
    expect(days.get(day(8))).toMatchObject({ dependableSupply: "0", projectedBefore: "30" });
    expect(days.get(day(12))).toMatchObject({ dependableSupply: "70", projectedBefore: "100" });
  });

  it("counts a requisition of 100 converted entirely into an order of 100 as 100 planned, not 200 (BUY-026)", async () => {
    expect(await read(`/api/tenants/prod/purchase-requisitions/${ids.requisition}`)).toMatchObject({ status: "completed", converted: "100.000000" });
    expect(await linesOf(ids.convertedPo)).toMatchObject([{ status: "open", quantity: "100.000000", received: ZERO, requisition: ids.requisition }]);

    const plan = await planOf(ids.converted);

    expect(supplyOf(plan)).toEqual({ 9: ["100.000000", ZERO] });
    expect(plan.buckets.at(-1)!.projectedBefore).toBe("100.000000");
    const days = await onScreen(plan);
    expect(days.get(day(9))).toMatchObject({ dependableSupply: "100", tentativeSupply: "0", projectedBefore: "100" });
    expect(days.get(day(89))).toMatchObject({ projectedBefore: "100" });
  });

  it("counts a received 40 in the balance from the first day and expects only the order's remaining 60 (MRP-010)", async () => {
    expect(await stock(ids.partial)).toBe("40.000000");

    const plan = await planOf(ids.partial);

    expect(supplyOf(plan)).toEqual({ 10: ["60.000000", ZERO] });
    expect(plan.buckets[0].projectedBefore).toBe("40.000000");
    expect(plan.buckets.at(-1)!.projectedBefore).toBe("100.000000");
    const days = await onScreen(plan);
    expect(days.get(day(0))).toMatchObject({ dependableSupply: "0", projectedBefore: "40" });
    expect(days.get(day(10))).toMatchObject({ dependableSupply: "60", projectedBefore: "100" });
  });

  it("counts a requisition of 100 with 60 converted as 60 ordered and 40 tentative, 100 in all (MRP-012)", async () => {
    expect(await read(`/api/tenants/prod/purchase-requisitions/${ids.splitRequisition}`)).toMatchObject({ status: "open", quantity: "100.000000", converted: "60.000000" });

    const plan = await planOf(ids.split);

    expect(supplyOf(plan)).toEqual({ 11: ["60.000000", ZERO], 14: [ZERO, "40.000000"] });
    expect(plan.buckets.at(-1)!.projectedBefore).toBe("100.000000");
    const days = await onScreen(plan);
    expect(days.get(day(11))).toMatchObject({ dependableSupply: "60", tentativeSupply: "0", projectedBefore: "60" });
    expect(days.get(day(14))).toMatchObject({ dependableSupply: "0", tentativeSupply: "40", projectedBefore: "100" });
  });

  it("projects neither a Completed line nor the 20 a Closed Early line abandoned (LFC-024)", async () => {
    expect(await linesOf(ids.linesPo)).toMatchObject([
      { line: 1, status: "completed", received: "50.000000", outstanding: ZERO },
      { line: 2, status: "closed-early", received: "30.000000", abandoned: "20.000000", outstanding: ZERO },
    ]);

    const plan = await planOf(ids.lines);

    expect(supplyOf(plan)).toEqual({});
    expect(balancesOf(plan)).toEqual(["80.000000"]);
    const days = await onScreen(plan);
    expect(days.get(day(16))).toMatchObject({ dependableSupply: "0", tentativeSupply: "0", projectedBefore: "80" });
  });

  it("balances a planned receipt of 40 and a component need of 40 on the same day, while completing the order still waits for the receipt (MRP-042)", async () => {
    expect(await read(`/api/tenants/prod/production-orders/${ids.production}`)).toMatchObject({ plannedStart: day(18), plannedFinish: day(20) });

    const plan = await planOf(ids.board);

    expect(plan.buckets[18]).toMatchObject({ dependableSupply: "40.000000", dependentDemand: "40.000000", projectedBefore: ZERO, shortage: ZERO });
    expect(plan.buckets.every(({ shortage }) => shortage === ZERO)).toBe(true);
    expect(plan.firstShortageDate).toBeNull();
    const days = await onScreen(plan);
    expect(days.get(day(18))).toMatchObject({ dependableSupply: "40", dependentDemand: "40", projectedBefore: "0", shortage: "0" });

    // Physically the board is still not there: the completion that would consume it is refused until the receipt is posted.
    expect(await stock(ids.board)).toBe(ZERO);
    const completion = { quantity: "20", unit: "each", components: [{ material: ids.board, quantity: "40", unit: "kg" }] };
    const early = await api("POST", `/api/tenants/prod/production-orders/${ids.production}/completions`, completion);
    expect(early.status, early.text).toBe(409);
    expect(json(early).error).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { material: ids.board } });
    await receive(ids.boardPo, [{ line: 1, quantity: "40" }]);
    await created(`/api/tenants/prod/production-orders/${ids.production}/completions`, completion);
    expect(await stock(ids.board)).toBe(ZERO);
    expect(await read(`/api/tenants/prod/production-orders/${ids.production}`)).toMatchObject({ produced: "20.000000" });
  });
});
