import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { AuditPage, PostedTransferView, StockView, TransferDetailView, TransferView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "trapi first password";
const today = () => new Date().toISOString().slice(0, 10);

// Transfers through the API (R07, E07-S03): TRF-001…011, TRF-013, TRF-014, TRF-022…024, TRF-026,
// INV-009, AUD-019, AUD-020, LFC-001, LFC-017, LFC-018, API-021, R05.
describe("transfers through the API", () => {
  let admin: Browser;
  let user: Browser;
  let adminSecret: string;
  /** A normal user's token: any signed-in account may transfer. */
  let userSecret: string;
  const ids: Record<"steel" | "bolt" | "a" | "b", string> = {} as never;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) => callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown, secret = adminSecret, key = randomUUID()) => api(method, path, { key, body }, secret);
  const create = async (path: string, body: unknown) => json(await write("POST", path, body)).data.id as string;
  const correct = (location: string, quantity: string) =>
    write("POST", "/api/tenants/prod/stock/corrections", { material: ids.steel, location, quantity, unit: "kg", reason: "trapi count" });
  const stock = async (location: string) => json(await api("GET", `/api/tenants/prod/stock?material=${ids.steel}&location=${location}`)).data as StockView;
  const physical = async (location: string) => (await stock(location)).quantity;
  /** A transfer of `quantity` kg of steel from A to B, planned yesterday → tomorrow. */
  const plan = async (quantity = "100", secret = userSecret) => {
    const response = await write("POST", "/api/tenants/prod/transfers", {
      material: ids.steel, source: ids.a, destination: ids.b, quantity, unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-21",
    }, secret);
    expect(response.status).toBe(200);
    return json(response).data as TransferView;
  };
  const post = (id: string, kind: "dispatches" | "receipts" | "write-offs", body: Record<string, string>, secret = userSecret, key = randomUUID()) =>
    write("POST", `/api/tenants/prod/transfers/${id}/${kind}`, { unit: "kg", ...body }, secret, key);
  const get = async (id: string) => json(await api("GET", `/api/tenants/prod/transfers/${id}`)).data as TransferDetailView;
  /** A fresh material and two fresh locations, so each test reads its own stock from zero and leaves no Open transfer on shared masters. */
  const fresh = async () => {
    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "trapi steel", baseUnit: "kg" });
    await write("POST", `/api/tenants/prod/materials/${ids.steel}/conversions`, { unit: "t", numerator: "1000", denominator: "1" });
    ids.a = await create("/api/tenants/prod/locations", { name: "trapi plant" });
    ids.b = await create("/api/tenants/prod/locations", { name: "trapi depot" });
  };

  beforeAll(async () => {
    admin = openBrowser();
    user = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "trapi-ops");
    ids.bolt = await create("/api/tenants/prod/materials", { type: "raw", description: "trapi bolt", baseUnit: "each" });
    await write("POST", "/api/users", { username: "trapi-una", password: PASSWORD });
    await signIn(user, baseUrl, PASSWORD, "trapi-una");
    await openTokens(user, baseUrl);
    userSecret = await createToken(user, "trapi-una-cli");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find((token) => token.name === "trapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await Promise.all([admin.close(), user.close()]);
  });

  it("creates an Open single-material transfer with its dates and changes no balance (TRF-001, TRF-003, LFC-001)", async () => {
    await fresh();
    await correct(ids.a, "100");

    const transfer = await plan();

    expect(transfer).toMatchObject({
      material: ids.steel, source: ids.a, destination: ids.b, quantity: "100.000000", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-21",
      dispatched: "0.000000", inTransit: "0.000000", undispatched: "100.000000", status: "open",
    });
    expect(await physical(ids.a)).toBe("100.000000");
    expect(await physical(ids.b)).toBe("0.000000");
    expect((json(await api("GET", "/api/tenants/prod/transfers?page=1")).data as TransferView[]).map(({ id }) => id)).toContain(transfer.id);
  });

  it("refuses A to A, an arrival before the dispatch and a second material, creating nothing (TRF-002, TRF-026)", async () => {
    await fresh();
    const body = { material: ids.steel, source: ids.a, destination: ids.b, quantity: "10", unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-21" };
    const before = json(await api("GET", "/api/tenants/prod/transfers?page=1")).data.length as number;

    const same = await write("POST", "/api/tenants/prod/transfers", { ...body, destination: ids.a, plannedArrival: "2026-10-18" });
    const two = await write("POST", "/api/tenants/prod/transfers", { ...body, materials: [ids.steel, ids.bolt] });
    const lines = await write("POST", "/api/tenants/prod/transfers", { ...body, lines: [{ material: ids.bolt, quantity: "1" }] });

    expect([same.status, two.status, lines.status]).toEqual([400, 400, 400]);
    expect(Object.keys(json(same).error.fieldErrors).sort()).toEqual(["destination", "plannedArrival"]);
    expect(Object.keys(json(two).error.fieldErrors)).toEqual(["materials"]);
    expect(Object.keys(json(lines).error.fieldErrors)).toEqual(["lines"]);
    expect(json(await api("GET", "/api/tenants/prod/transfers?page=1")).data.length).toBe(before);
  });

  it("dispatches into transit dated today, then the rest, and refuses more than the source holds (TRF-004, TRF-005, TRF-008, TRF-009, TRF-023, INV-009)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();

    const first = await post(transfer.id, "dispatches", { quantity: "60" });
    expect(first.status).toBe(200);
    const posted = json(first).data as PostedTransferView;
    expect(posted.transfer).toMatchObject({ dispatched: "60.000000", inTransit: "60.000000", undispatched: "40.000000", status: "open", plannedDispatch: "2026-10-19" });
    expect(posted.posting).toMatchObject({ kind: "dispatch", businessDate: today() });
    expect(await physical(ids.a)).toBe("40.000000");
    expect(await physical(ids.b)).toBe("0.000000");

    // The source now holds 40, but another 25 kg of it are corrected away: 15 left with 40 outstanding.
    await correct(ids.a, "-25");
    const refused = await post(transfer.id, "dispatches", { quantity: "20" });
    expect(refused.status).toBe(409);
    expect(json(refused).error).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { available: "15.000000", requested: "20.000000" } });
    expect(await physical(ids.a)).toBe("15.000000");
    expect((await get(transfer.id)).inTransit).toBe("60.000000");

    await correct(ids.a, "25");
    expect((await post(transfer.id, "dispatches", { quantity: "0.04", unit: "t" })).status).toBe(200);
    expect(await get(transfer.id)).toMatchObject({ dispatched: "100.000000", inTransit: "100.000000", undispatched: "0.000000" });
    const over = await post(transfer.id, "dispatches", { quantity: "1" });
    expect(json(over).error.code).toBe("TRANSFER_OVER_DISPATCH");
  });

  it("receives part of the transit at the destination, refuses more, and keeps the source (TRF-006, TRF-007)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();
    await post(transfer.id, "dispatches", { quantity: "60" });

    expect((await post(transfer.id, "receipts", { quantity: "50" })).status).toBe(200);
    expect(await physical(ids.b)).toBe("50.000000");
    expect(await physical(ids.a)).toBe("40.000000");
    expect((await get(transfer.id)).inTransit).toBe("10.000000");

    const over = await post(transfer.id, "receipts", { quantity: "11" });
    expect(over.status).toBe(409);
    expect(json(over).error).toMatchObject({ code: "TRANSFER_OVER_RECEIPT", params: { available: "10.000000" } });
    expect(await physical(ids.b)).toBe("50.000000");
    expect((await get(transfer.id)).inTransit).toBe("10.000000");
  });

  it("keeps transit usable at neither site: corrections and the stock page see physical stock only (TRF-010, TRF-011, UX-017)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();
    await post(transfer.id, "dispatches", { quantity: "60" });

    const atSource = await correct(ids.a, "-41");
    const atDestination = await correct(ids.b, "-5");
    expect([json(atSource).error.code, json(atDestination).error.code]).toEqual(["INSUFFICIENT_STOCK", "INSUFFICIENT_STOCK"]);
    expect(await stock(ids.a)).toMatchObject({ quantity: "40.000000", inTransitFrom: "60.000000", inTransitTo: "0.000000" });
    expect(await stock(ids.b)).toMatchObject({ quantity: "0.000000", inTransitFrom: "0.000000", inTransitTo: "60.000000" });
  });

  it("writes off lost transit with its reason, refuses a correction that names a transfer, and audits both (TRF-013, TRF-014)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();
    await post(transfer.id, "dispatches", { quantity: "10" });

    const sideways = await write("POST", "/api/tenants/prod/stock/corrections", { material: ids.steel, location: ids.a, quantity: "-10", unit: "kg", reason: "Lost", transfer: transfer.id });
    expect(sideways.status).toBe(400);
    expect(Object.keys(json(sideways).error.fieldErrors)).toEqual(["transfer"]);
    expect(await physical(ids.a)).toBe("90.000000");

    const unexplained = await post(transfer.id, "write-offs", { quantity: "10" });
    expect(Object.keys(json(unexplained).error.fieldErrors)).toEqual(["reason"]);
    const written = await post(transfer.id, "write-offs", { quantity: "10", reason: "trapi pallet lost" });
    expect(written.status).toBe(200);
    expect((json(written).data as PostedTransferView).transfer).toMatchObject({ inTransit: "0.000000", writtenOff: "10.000000", status: "open" });
    expect(await physical(ids.a)).toBe("90.000000");
    expect(await physical(ids.b)).toBe("0.000000");
    const audit = (json(await api("GET", "/api/tenants/prod/audit?limit=100")).data as AuditPage).entries.find(
      (entry) => entry.action === "transfers.transfer.written-off" && entry.subject.id === transfer.id,
    )!;
    expect(audit).toMatchObject({ channel: "api", after: { reason: "trapi pallet lost", inTransit: "0.000000", writtenOff: "10.000000" } });
  });

  it("completes the transfer on the last receipt of the planned quantity, then takes no more postings (spec Q7)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();
    await post(transfer.id, "dispatches", { quantity: "100" });
    await post(transfer.id, "receipts", { quantity: "70" });

    const last = await post(transfer.id, "receipts", { quantity: "30" });

    expect((json(last).data as PostedTransferView).transfer).toMatchObject({ status: "completed", received: "100.000000", inTransit: "0.000000" });
    const closed = await post(transfer.id, "receipts", { quantity: "1" });
    expect([closed.status, json(closed).error.code]).toEqual([409, "TRANSFER_NOT_OPEN"]);
  });

  it("shows the ledger's four legs with the transfer as their source (TRF-024)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();
    const dispatch = json(await post(transfer.id, "dispatches", { quantity: "60" })).data as PostedTransferView;
    const receipt = json(await post(transfer.id, "receipts", { quantity: "50" })).data as PostedTransferView;

    const legs = (await get(transfer.id)).postings.reverse().flatMap(({ legs }) => legs.map(({ place, location, quantity }) => [place, location, quantity]));
    expect(legs).toEqual([
      ["source", ids.a, "-60.000000"],
      ["transit", null, "60.000000"],
      ["transit", null, "-50.000000"],
      ["destination", ids.b, "50.000000"],
    ]);
    const [atA] = (await stock(ids.a)).movements;
    const [atB] = (await stock(ids.b)).movements;
    expect(atA).toMatchObject({ type: "transfer-dispatch", postingId: dispatch.posting.id, quantity: "-60.000000", reason: `Transfer ${transfer.id} dispatch from ${ids.a} to ${ids.b}` });
    expect(atB).toMatchObject({ type: "transfer-receipt", postingId: receipt.posting.id, quantity: "50.000000", reason: `Transfer ${transfer.id} receipt at ${ids.b} from ${ids.a}` });
  });

  it("refuses a destination of another tenant, and neither tenant changes (TRF-022, R05)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const testTenant = json(await api("GET", "/api/tenants/test")).data as { generation: number };
    const testRows = json(await api("GET", "/api/tenants/test/locations")).data as { id: string; active: boolean }[];
    const testLocations = testRows.map(({ id }) => id);
    // A Prod location whose ID the Test tenant doesn't have.
    let prodOnly = ids.b;
    while (testLocations.includes(prodOnly)) prodOnly = await create("/api/tenants/prod/locations", { name: "trapi prod-only" });
    const testMaterial = (json(await api("GET", "/api/tenants/test/materials")).data as { id: string; active: boolean }[]).find(({ active }) => active)!;
    const testLocation = testRows.find(({ active }) => active)!.id;
    const testBefore = (json(await api("GET", "/api/tenants/test/transfers")).data as unknown[]).length;

    const crossed = await api("POST", "/api/tenants/test/transfers", {
      key: randomUUID(),
      generation: testTenant.generation,
      body: { material: testMaterial.id, source: testLocation, destination: prodOnly, quantity: "1", unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-21" },
    });

    expect(crossed.status).toBe(404);
    expect(json(crossed).error.code).toBe("LOCATION_NOT_FOUND");
    expect((json(await api("GET", "/api/tenants/test/transfers")).data as unknown[]).length).toBe(testBefore);
    expect(await physical(ids.a)).toBe("100.000000");
  });

  it("refuses deactivating a location with transit from or to it or an unfinished transfer, and a material with an Open transfer (LFC-017, LFC-018)", async () => {
    await fresh();
    await correct(ids.a, "60");
    const transfer = await plan("60");
    await post(transfer.id, "dispatches", { quantity: "60" });
    expect(await physical(ids.a)).toBe("0.000000");

    for (const location of [ids.a, ids.b]) {
      const { version } = json(await api("GET", `/api/tenants/prod/locations/${location}`)).data as { version: number };
      const refused = await write("PATCH", `/api/tenants/prod/locations/${location}`, { version, active: false });
      expect(refused.status).toBe(409);
      expect(json(refused).error).toMatchObject({ code: "LOCATION_HAS_OPEN_TRANSFERS", params: { transfer: transfer.id } });
    }
    const material = json(await api("GET", `/api/tenants/prod/materials/${ids.steel}`)).data as { version: number };
    const refusedMaterial = await write("PATCH", `/api/tenants/prod/materials/${ids.steel}`, { version: material.version, active: false });
    expect(json(refusedMaterial).error).toMatchObject({ code: "MATERIAL_IN_OPEN_TRANSFER", params: { transfer: transfer.id } });

    // Once the transfer is completed and the destination emptied, both locations can go.
    await post(transfer.id, "receipts", { quantity: "60" });
    await correct(ids.b, "-60");
    for (const location of [ids.a, ids.b]) {
      const { version } = json(await api("GET", `/api/tenants/prod/locations/${location}`)).data as { version: number };
      expect((await write("PATCH", `/api/tenants/prod/locations/${location}`, { version, active: false })).status).toBe(200);
    }
  });

  it("changes the planned dates at the loaded version only, refusing what never changes (TRF-026)", async () => {
    await fresh();
    const transfer = await plan("10");
    const path = `/api/tenants/prod/transfers/${transfer.id}`;

    const moved = await write("PATCH", path, { version: transfer.version, plannedDispatch: "2026-10-22", plannedArrival: "2026-10-24" }, userSecret);
    expect(moved.status).toBe(200);
    expect(json(moved).data).toMatchObject({ plannedDispatch: "2026-10-22", plannedArrival: "2026-10-24" });
    const stale = await write("PATCH", path, { version: transfer.version, plannedDispatch: "2026-10-23", plannedArrival: "2026-10-24" }, userSecret);
    expect(json(stale).error.code).toBe("VERSION_CONFLICT");
    const backwards = await write("PATCH", path, { version: json(moved).data.version, plannedDispatch: "2026-10-25", plannedArrival: "2026-10-24" }, userSecret);
    expect(Object.keys(json(backwards).error.fieldErrors)).toEqual(["plannedArrival"]);
    const requantified = await write("PATCH", path, { version: json(moved).data.version, plannedDispatch: "2026-10-22", plannedArrival: "2026-10-24", quantity: "5" }, userSecret);
    expect(Object.keys(json(requantified).error.fieldErrors)).toEqual(["quantity"]);
    expect(await get(transfer.id)).toMatchObject({ plannedDispatch: "2026-10-22", quantity: "10.000000" });
    const missing = await api("GET", "/api/tenants/prod/transfers/99999999");
    expect([missing.status, json(missing).error.code]).toEqual([404, "TRANSFER_NOT_FOUND"]);
  });

  it("returns the original posting for a retry with the same key, moving stock once (API-021)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();
    const key = randomUUID();

    const first = await post(transfer.id, "dispatches", { quantity: "30" }, userSecret, key);
    const replay = await post(transfer.id, "dispatches", { quantity: "30" }, userSecret, key);

    expect(replay.replayed).toBe("true");
    expect(json(replay).data.posting.id).toBe(json(first).data.posting.id);
    expect(await physical(ids.a)).toBe("70.000000");
    expect((await get(transfer.id)).dispatched).toBe("30.000000");
  });

  it("refuses transfer writes in a read-only tenant with no movement, reads still working (R05)", async () => {
    await fresh();
    await correct(ids.a, "100");
    const transfer = await plan();
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      const refused = await post(transfer.id, "dispatches", { quantity: "30" });
      expect([refused.status, json(refused).error.code]).toEqual([409, "TENANT_READ_ONLY"]);
      const created = await write("POST", "/api/tenants/prod/transfers", { material: ids.steel, source: ids.a, destination: ids.b, quantity: "1", unit: "kg", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-21" });
      expect(json(created).error.code).toBe("TENANT_READ_ONLY");
      expect((await get(transfer.id)).dispatched).toBe("0.000000");
    } finally {
      expect((await write("PATCH", "/api/tenants/prod", { readOnly: false })).status).toBe(200);
    }
    expect(await physical(ids.a)).toBe("100.000000");
  });

  it("searches and sorts the list on the server, and still refuses an unknown query key (#221)", async () => {
    const copper = await create("/api/tenants/prod/materials", { type: "raw", description: "trsq copper", baseUnit: "kg" });
    const north = await create("/api/tenants/prod/locations", { name: "trsq north" });
    const south = await create("/api/tenants/prod/locations", { name: "trsq south" });
    const created: string[] = [];
    for (const [source, destination, plannedDispatch] of [[north, south, "2027-07-02"], [south, north, "2027-07-03"], [north, south, "2027-07-01"]]) {
      const response = await write("POST", "/api/tenants/prod/transfers", {
        material: copper, source, destination, quantity: "5", unit: "kg", plannedDispatch, plannedArrival: "2027-07-09",
      });
      expect(response.status).toBe(200);
      created.push(json(response).data.id);
    }
    const list = async (query: string) => {
      const response = await api("GET", `/api/tenants/prod/transfers?${query}`);
      expect(response.status).toBe(200);
      return json(response).data as TransferView[];
    };

    expect((await list("q=trsq")).map(({ id }) => id)).toEqual(created);
    expect((await list("q=trsq&sort=plannedDispatch&dir=desc")).map(({ plannedDispatch }) => plannedDispatch)).toEqual(["2027-07-03", "2027-07-02", "2027-07-01"]);
    expect((await list("q=trsq&sort=source")).map(({ id }) => id)).toEqual([created[0], created[2], created[1]]);
    expect((await list("q=trsq&page=2"))).toEqual([]);

    for (const [query, field] of [["sort=quantity", "sort"], ["dir=up", "dir"]]) {
      const refused = await api("GET", `/api/tenants/prod/transfers?${query}`);
      expect(refused.status).toBe(400);
      expect(Object.keys(json(refused).error.fieldErrors)).toEqual([field]);
    }
    expect((await api("GET", "/api/tenants/prod/transfers?q=trsq&surprise=1")).status).toBe(400);
  });
});
