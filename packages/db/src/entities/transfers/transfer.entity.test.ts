import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm, migrate } from "../../orm";
import { Location, Material, selectTenant, Transfer, TransferPosting } from "../index";

describe("Transfer and TransferPosting", () => {
  it("get UUIDs and their timestamps when created without them, and a transfer starts Open with nothing moved", async () => {
    const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-transfer-")), "db.sqlite");
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    try {
      const em = orm.em.fork();
      selectTenant(em, "test");
      const material = em.create(Material, { code: "00000001", type: "raw", description: "Flour", baseUnit: "kg" });
      const source = em.create(Location, { code: "00000001", name: "Plant" });
      const destination = em.create(Location, { code: "00000002", name: "Depot" });
      const transfer = em.create(Transfer, {
        code: "00000001", material, source, destination, quantity: "100.000000", enteredQuantity: "100", enteredUnit: "kg",
        numerator: "1", denominator: "1", plannedDispatch: "2026-10-21", plannedArrival: "2026-10-23",
      });
      const posting = em.create(TransferPosting, {
        transfer, kind: "dispatch", businessDate: "2026-10-21", quantity: "60.000000", enteredQuantity: "60", enteredUnit: "kg",
        numerator: "1", denominator: "1", transitBefore: "0.000000", transitAfter: "60.000000", reason: "Transfer 00000001 dispatch",
        actorUserId: null, actorUsername: "admin", channel: "ui",
      });
      await em.flush();

      expect(transfer.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(transfer.createdAt).toBeInstanceOf(Date);
      expect(transfer.updatedAt).toBeInstanceOf(Date);
      expect([transfer.status, transfer.dispatched, transfer.received, transfer.writtenOff, transfer.version]).toEqual(["open", "0.000000", "0.000000", "0.000000", 1]);
      expect(posting.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(posting.occurredAt).toBeInstanceOf(Date);
    } finally {
      await orm.close();
    }
  });
});
