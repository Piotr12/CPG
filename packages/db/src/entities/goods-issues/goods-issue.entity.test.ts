import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm, migrate } from "../../orm";
import { Customer, CustomerOrder, GoodsIssue, Location, selectTenant, Shipment } from "../index";

describe("GoodsIssue", () => {
  it("gets a UUID and its creation time when created without them, on a shipment that starts Open", async () => {
    const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-goods-issue-")), "db.sqlite");
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    try {
      const em = orm.em.fork();
      selectTenant(em, "test");
      const customer = em.create(Customer, { code: "00000001", name: "Retail" });
      const location = em.create(Location, { code: "00000001", name: "Plant" });
      const order = em.create(CustomerOrder, { code: "00000001", customer, location });
      const shipment = em.create(Shipment, { code: "00000001", order, plannedDate: "2026-10-25" });
      const issue = em.create(GoodsIssue, { code: "00000001", shipment, businessDate: "2026-10-20" });
      await em.flush();

      expect(issue.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(issue.createdAt).toBeInstanceOf(Date);
      expect(shipment.status).toBe("open");
    } finally {
      await orm.close();
    }
  });
});
