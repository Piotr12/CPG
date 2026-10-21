import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, selectTenant, Location, Material, StockMovement, StockReversal, Tenant, TenantAuditEvent, type Orm } from "@cpg/db";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import * as audit from "../audit/audit-recorder";
import { StockService } from "./stock.service";
import { StockReversalService } from "./stock-reversal.service";

const actor = { userId: "u1", username: "Alice", sessionId: "s1", channel: "ui" as const, token: null };
const pair = { material: "00000001", location: "00000001" };
const input = { reason: "Duplicate count" };
let orm: Orm;
let directory: string;
const scope = (tenant: "prod" | "test" = "prod", connection = orm) => { const em = connection.em.fork(); selectTenant(em, tenant); return em; };
const stock = () => new StockService({ em: scope() });
const reversals = () => new StockReversalService({ em: scope() });
const correct = (quantity: string) => stock().correct({ ...pair, quantity, unit: "each", reason: "Count" }, actor);
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-reversal-"));
  const databasePath = path.join(directory, "db.sqlite");
  await migrate({ databasePath }); orm = await initOrm({ databasePath });
  const em = scope();
  em.create(Material, { code: pair.material, type: "raw", description: "Bolts", baseUnit: "each" });
  em.create(Location, { code: pair.location, name: "Plant" });
  await em.flush();
});
afterEach(async () => { vi.restoreAllMocks(); await orm.close(); rmSync(directory, { recursive: true }); });

describe("StockReversalService", () => {
  it.each(["5", "-5"])("reverses the whole correction %s once with immutable linked audit", async (quantity) => {
    await correct("10"); const original = await correct(quantity);
    const before = await scope().findOneOrFail(StockMovement, original.id);
    const response = await reversals().reverse(original.id, { reason: " Duplicate count " }, actor);
    expect(response).toMatchObject({ original: original.id, movement: { quantity: quantity === "5" ? "-5.000000" : "5.000000", reason: "Duplicate count", type: "reversal" } });
    expect(await scope().findOneOrFail(StockReversal, { original: original.id })).toMatchObject({ inverse: { id: response.movement.id } });
    expect(await scope().findOneOrFail(StockMovement, original.id)).toMatchObject({ quantity: before.quantity, reason: before.reason, occurredAt: before.occurredAt });
    expect(await stock().get(pair)).toMatchObject({ quantity: "10.000000", movementCount: 3 });
    expect(await scope().find(TenantAuditEvent, { action: "stock.movement.reversed" })).toMatchObject([{ subjectId: original.id, actorUsername: "Alice", sessionId: "s1", before: { reversed: false }, after: { reversed: true, original: original.id, reversal: response.movement.id, reason: "Duplicate count" } }]);
    await expect(reversals().reverse(original.id, input, actor)).rejects.toMatchObject({ code: "STOCK_ALREADY_REVERSED", messageParams: { reversal: response.movement.id } });
    await expect(reversals().reverse(response.movement.id, input, actor)).rejects.toMatchObject({ code: "STOCK_REVERSAL_UNSUPPORTED" });
    expect(await scope().count(StockReversal, {})).toBe(1);
  });

  it("refuses blank reasons, partial quantities and unknown or other-tenant movements without a write", async () => {
    const original = await correct("5");
    await expect(reversals().reverse(original.id, { reason: " " }, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(reversals().reverse(original.id, { ...input, quantity: "2" }, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(reversals().reverse(randomUUID(), input, actor)).rejects.toMatchObject({ code: "STOCK_MOVEMENT_NOT_FOUND" });
    await expect(new StockReversalService({ em: scope("test") }).reverse(original.id, input, actor)).rejects.toMatchObject({ code: "STOCK_MOVEMENT_NOT_FOUND" });
    expect(await scope().count(StockReversal, {})).toBe(0);
  });

  it.each(["production-completion", "transfer-dispatch", "transfer-receipt", "unknown"])("refuses unsupported source %s", async (type) => {
    const [original] = await stock().post({ lines: [{ ...pair, quantity: "5", unit: "each" }], reason: "Original" }, { type, id: randomUUID() }, actor);
    await expect(reversals().reverse(original.id, input, actor)).rejects.toMatchObject({ code: "STOCK_REVERSAL_UNSUPPORTED" });
    expect(await stock().get(pair)).toMatchObject({ quantity: "5.000000", movementCount: 1 });
  });

  it("rechecks a read-only tenant in the write transaction", async () => {
    const original = await correct("5");
    const staleService = reversals();
    await orm.em.fork().nativeUpdate(Tenant, { code: "prod" }, { readOnly: true });
    await expect(staleService.reverse(original.id, input, actor)).rejects.toMatchObject({ code: "TENANT_READ_ONLY" });
    expect(await scope().count(StockReversal, {})).toBe(0);
  });

  it("rolls back movement, balance, link and audit when audit fails after the stock flush", async () => {
    const original = await correct("5");
    const record = audit.recordTenantAudit;
    vi.spyOn(audit, "recordTenantAudit").mockImplementation((em, who, event) => {
      if (event.action === "stock.movement.reversed") throw new Error("Audit unavailable");
      return record(em, who, event);
    });
    await expect(reversals().reverse(original.id, input, actor)).rejects.toThrow("Audit unavailable");
    expect(await stock().get(pair)).toMatchObject({ quantity: "5.000000", movementCount: 1 });
    expect(await scope().count(StockReversal, {})).toBe(0);
    expect(await scope().count(TenantAuditEvent, {})).toBe(1);
  });

  it("retries a stale snapshot against the already-reversed state, never posting a second inverse", async () => {
    const original = await correct("5");
    const other = await initOrm({ databasePath: path.join(directory, "db.sqlite") });
    const em = scope(); let raced = false;
    try {
      await expect(retryingStaleSnapshot(() => inRequestTransaction(em, async () => {
        await em.findOneOrFail(StockMovement, original.id);
        if (!raced) { raced = true; await new StockReversalService({ em: scope("prod", other) }).reverse(original.id, input, actor); }
        return new StockReversalService({ em }).reverse(original.id, input, actor);
      }))).rejects.toMatchObject({ code: "STOCK_ALREADY_REVERSED" });
      expect(await scope().count(StockReversal, {})).toBe(1);
      expect(await stock().get(pair)).toMatchObject({ quantity: "0.000000", movementCount: 2 });
    } finally { await other.close(); }
  });
});
