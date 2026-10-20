import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm, migrate } from "../../orm";
import { GoodsReceipt, Location, PurchaseOrder, selectTenant, Supplier } from "../index";

describe("GoodsReceipt", () => {
  it("gets a UUID and its creation time when created without them", async () => {
    const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-goods-receipt-")), "db.sqlite");
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    try {
      const em = orm.em.fork();
      selectTenant(em, "test");
      const supplier = em.create(Supplier, { code: "00000001", name: "Acme" });
      const location = em.create(Location, { code: "00000001", name: "Plant" });
      const order = em.create(PurchaseOrder, { code: "00000001", supplier, location });
      const receipt = em.create(GoodsReceipt, { code: "00000001", order, businessDate: "2026-10-20" });
      await em.flush();

      expect(receipt.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(receipt.createdAt).toBeInstanceOf(Date);
      expect(order.status).toBe("open");
    } finally {
      await orm.close();
    }
  });
});
