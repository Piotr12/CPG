import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlobalAuditEvent, initOrm, Location, Material, migrate, selectTenant, TenantAuditEvent, User, type Orm } from "@cpg/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditListSchema } from "../../validators/audit/audit-list.schema";
import { StockService } from "../stock/stock.service";
import { StockReversalService } from "../stock/stock-reversal.service";
import { UserService } from "../users/user.service";
import { auditWhere, AuditService } from "./audit.service";

/** An audit row; `label` names it in assertions. */
const row = (label: string, occurredAt: string, fields: Partial<{ subjectType: string; subjectId: string; actorUsername: string; channel: "ui" | "api" }> = {}) => ({
  occurredAt: new Date(occurredAt),
  action: "purchase-orders.purchase-order.updated",
  subjectType: "PurchaseOrder",
  subjectId: "00000012",
  subjectLabel: label,
  before: null,
  after: { plannedDate: "2026-11-06" },
  actorUserId: "user-id",
  actorUsername: "alice",
  sessionId: "session",
  channel: "ui" as const,
  ...fields,
});

let orm: Orm;
let directory: string;
const scoped = (code?: "test" | "prod") => {
  const em = orm.em.fork();
  if (code) selectTenant(em, code);
  return em;
};
const service = (code?: "test" | "prod") => new AuditService({ em: scoped(code) });
const query = (raw: Record<string, unknown> = {}) => auditListSchema.parse(raw);
const labels = async (raw: Record<string, unknown>, code: "test" | "prod" = "test") =>
  (await service(code).listTenant(query(raw))).entries.map(({ subject }) => subject.label);

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-audit-history-"));
  const databasePath = path.join(directory, "cpg.sqlite");
  await migrate({ databasePath });
  orm = await initOrm({ databasePath });
  const em = scoped("test");
  em.create(TenantAuditEvent, row("material-same-id", "2026-10-19T12:00:00.000Z", { subjectType: "Material", channel: "api" }));
  em.create(TenantAuditEvent, row("po12-first", "2026-10-20T00:00:00.000Z"));
  em.create(TenantAuditEvent, row("po12-bob-api", "2026-10-20T23:59:59.999Z", { actorUsername: "bob", channel: "api" }));
  em.create(TenantAuditEvent, row("po13", "2026-10-21T00:00:00.000Z", { subjectId: "00000013" }));
  em.create(TenantAuditEvent, row("po12-later", "2026-10-21T10:00:00.000Z"));
  // Three entries of one instant: ordered by id, and paged without repeats or gaps.
  for (const n of [1, 2, 3]) em.create(TenantAuditEvent, row(`po12-tie-${n}`, "2026-10-22T09:00:00.000Z"));
  await em.flush();
  const prod = scoped("prod");
  prod.create(TenantAuditEvent, row("prod-po12", "2026-10-21T10:00:00.000Z"));
  await prod.flush();
  const global = scoped();
  global.create(GlobalAuditEvent, row("user-alice", "2026-10-20T10:00:00.000Z", { subjectType: "User", subjectId: "alice-id", actorUsername: "admin" }));
  global.create(GlobalAuditEvent, row("token-bob", "2026-10-20T11:00:00.000Z", { subjectType: "ApiToken", subjectId: "token-id", actorUsername: "bob", channel: "api" }));
  await global.flush();
});
afterAll(async () => {
  await orm.close();
  rmSync(directory, { recursive: true });
});

describe("AuditService filters", () => {
  it("traces one purchase order: only its entries, newest first, not another type's record with the same ID (PRD §07)", async () => {
    const page = await service("test").listTenant(query({ subjectType: "PurchaseOrder", subjectId: "00000012" }));
    const ties = page.entries.slice(0, 3).map(({ subject }) => subject.label);
    expect(ties.sort()).toEqual(["po12-tie-1", "po12-tie-2", "po12-tie-3"]);
    expect(page.entries.slice(3).map(({ subject }) => subject.label)).toEqual(["po12-later", "po12-bob-api", "po12-first"]);
    expect(page.nextBefore).toBeNull();
  });

  it("narrows by record type alone, by account, and by channel", async () => {
    expect(await labels({ subjectType: "Material" })).toEqual(["material-same-id"]);
    expect(await labels({ account: "Bob" })).toEqual(["po12-bob-api"]);
    expect(await labels({ channel: "api" })).toEqual(["po12-bob-api", "material-same-id"]);
  });

  it("includes both ends of a range of UTC days, to the millisecond", async () => {
    expect(await labels({ from: "2026-10-20", to: "2026-10-20" })).toEqual(["po12-bob-api", "po12-first"]);
    expect(await labels({ from: "2026-10-21", to: "2026-10-21" })).toEqual(["po12-later", "po13"]);
    expect(await labels({ to: "2026-10-19" })).toEqual(["material-same-id"]);
    expect((await labels({ from: "2026-10-22" })).sort()).toEqual(["po12-tie-1", "po12-tie-2", "po12-tie-3"]);
  });

  it("combines every filter with AND", async () => {
    const raw = { subjectType: "PurchaseOrder", subjectId: "00000012", account: "alice", channel: "ui", from: "2026-10-20", to: "2026-10-21" };
    expect(await labels(raw)).toEqual(["po12-later", "po12-first"]);
  });

  it("pages a filtered history without repeats or gaps, through entries that share one instant", async () => {
    const seen: string[] = [];
    let before: string | undefined;
    do {
      const page = await service("test").listTenant(query({ subjectType: "PurchaseOrder", subjectId: "00000012", limit: 2, before }));
      seen.push(...page.entries.map(({ subject }) => subject.label));
      before = page.nextBefore ?? undefined;
    } while (before);
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    expect(seen.slice(3)).toEqual(["po12-later", "po12-bob-api", "po12-first"]);
  });

  it("takes a cursor from an unfiltered page as a position: the matching entries older than it", async () => {
    const all = (await service("test").listTenant(query())).entries;
    const po13 = all.find(({ subject }) => subject.label === "po13")!;
    expect(await labels({ subjectType: "PurchaseOrder", subjectId: "00000012", before: po13.id })).toEqual(["po12-bob-api", "po12-first"]);
  });

  it("answers an unknown account or record with an empty page, not an error", async () => {
    expect(await service("test").listTenant(query({ account: "nobody" }))).toEqual({ entries: [], nextBefore: null });
    expect(await labels({ subjectType: "PurchaseOrder", subjectId: "99999999" })).toEqual([]);
  });

  it("keeps each tenant's history its own (R05)", async () => {
    expect(await labels({ subjectType: "PurchaseOrder", subjectId: "00000012" }, "prod")).toEqual(["prod-po12"]);
  });

  it("filters the Global audit the same way", async () => {
    const global = async (raw: Record<string, unknown>) => (await service().listGlobal(query(raw))).entries.map(({ subject }) => subject.label);
    expect(await global({ subjectType: "User", subjectId: "alice-id" })).toEqual(["user-alice"]);
    expect(await global({ account: "bob", channel: "api" })).toEqual(["token-bob"]);
    expect(await global({ from: "2026-10-21" })).toEqual([]);
  });

  it("returns entries with exactly the fields they had before the filters (no response shape change)", async () => {
    const [entry] = (await service("test").listTenant(query({ subjectType: "Material" }))).entries;
    expect(Object.keys(entry).sort()).toEqual(["action", "actor", "after", "before", "channel", "id", "occurredAt", "sessionId", "subject", "token"]);
  });

  it("builds no condition from no filters", () => {
    expect(auditWhere({})).toEqual({});
  });
});

describe("AuditService.reversalLinks", () => {
  const actor = { userId: "u1", username: "alice", sessionId: "s1", channel: "ui" as const, token: null };
  const pair = { material: "00000001", location: "00000001" };

  it("links an original and its reversal from either side, in one query, within the tenant (AUD-004, REV-020)", async () => {
    const em = scoped("prod");
    em.create(Material, { code: pair.material, type: "raw", description: "Bolts", baseUnit: "each" });
    em.create(Location, { code: pair.location, name: "Plant" });
    await em.flush();
    const original = await new StockService({ em: scoped("prod") }).correct({ ...pair, quantity: "25", unit: "each", reason: "Count" }, actor);
    const { movement: inverse } = await new StockReversalService({ em: scoped("prod") }).reverse(original.id, { reason: "Counted the wrong bin" }, actor);
    const link = { original: original.id, inverse: inverse.id };

    expect(await service("prod").reversalLinks([original.id])).toEqual([link]);
    expect(await service("prod").reversalLinks([inverse.id])).toEqual([link]);
    expect(await service("prod").reversalLinks([original.id, inverse.id, "unrelated"])).toEqual([link]);
    expect(await service("test").reversalLinks([original.id, inverse.id])).toEqual([]);

    // Both movements' entries carry the reason, so the linked entries explain the reversal.
    const movementHistory = async (id: string) =>
      (await service("prod").listTenant(query({ subjectType: "StockMovement", subjectId: id }))).entries.map(({ action, after }) => [action, after?.reason]);
    expect(await movementHistory(original.id)).toEqual([["stock.movement.reversed", "Counted the wrong bin"], ["stock.movement.posted", "Count"]]);
    expect(await movementHistory(inverse.id)).toEqual([["stock.movement.posted", "Counted the wrong bin"]]);
  });

  it("makes no query for no movements", async () => {
    const em = scoped("prod");
    const find = vi.spyOn(em, "find");
    expect(await new AuditService({ em }).reversalLinks([])).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});

describe("UserService.usernames", () => {
  it("lists every account's username, sorted, and nothing else", async () => {
    const em = scoped();
    em.create(User, { username: "zoe", role: "user", passwordHash: "hash" });
    em.create(User, { username: "adam", role: "user", passwordHash: "hash" });
    await em.flush();
    const names = await new UserService({ em: scoped() }).usernames();
    expect(names).toEqual([...names].sort());
    expect(names).toEqual(expect.arrayContaining(["adam", "zoe"]));
    expect(names.every((name) => typeof name === "string")).toBe(true);
  });
});
