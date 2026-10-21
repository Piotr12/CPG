import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOM_REVISION_IMMUTABLE,
  GOODS_ISSUE_IMMUTABLE,
  GOODS_RECEIPT_IMMUTABLE,
  PRODUCTION_COMPLETION_IMMUTABLE,
  TRANSFER_POSTING_IMMUTABLE,
} from "./entities";
import { migrations } from "./migrations";
import { getMigrationStatus, initOrm, migrate } from "./orm";

const tempDatabase = () => path.join(mkdtempSync(path.join(tmpdir(), "cpg-db-")), "nested", "cpg.sqlite");

describe("initOrm", () => {
  it("creates the database directory and switches to WAL mode", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      expect(existsSync(path.dirname(databasePath))).toBe(true);
      const [{ journal_mode }] = await orm.em.getConnection().execute("pragma journal_mode");
      expect(journal_mode).toBe("wal");
    } finally {
      await orm.close();
    }
  });

  it("applies config overrides", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() }, { debug: true, logger: () => {} });

    try {
      expect(orm.config.get("debug")).toBe(true);
    } finally {
      await orm.close();
    }
  });
});

describe("migrate", () => {
  it("applies pending migrations once and closes its connection", async () => {
    const databasePath = tempDatabase();

    expect(await migrate({ databasePath })).toEqual([
      "Migration20261017091007_initial",
      "Migration20261019080354_auth_users_sessions",
      "Migration20261019090456_user_preferences",
      "Migration20261019092708_tenants",
      "Migration20261019103355_users_password_active",
      "Migration20261019110502_audit_events",
      "Migration20261019115945_api_tokens",
      "Migration20261019155802_api_idempotency",
      "Migration20261019191302_materials",
      "Migration20261019202843_locations_customers_suppliers",
      "Migration20261019211303_tenant_read_only",
      "Migration20261020054509_planning_parameters_safety_stock",
      "Migration20261020080940_boms",
      "Migration20261020164210_forecasts",
      "Migration20261020164223_customer_orders",
      "Migration20261020164229_stock_ledger",
      "Migration20261020164640_test_reset",
      "Migration20261020173715_customer_order_demand_index",
      "Migration20261020180000_purchasing",
      "Migration20261020193728_goods_receipts",
      "Migration20261020205207_production_orders",
      "Migration20261020205226_transfers",
      "Migration20261020214038_shipments_goods_issues",
      "Migration20261020223625_production_completions",
      "Migration20261021071704_document_lifecycle",
      "Migration20261021071806_stock_reversals",
      "Migration20261021075527_shipment_order_cursor",
      "Migration20261021101252_transfer_reversals",
    ]);
    expect(await migrate({ databasePath })).toEqual([]);
  });
  it("adopts the customer-order migrations after a database already running the main-branch stock ledger", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    try {
      const previous = migrations.map((migration) => migration.name).filter((name) => !name.includes("customer_order") && !name.includes("shipment"));
      await orm.migrator.up({ migrations: previous });
      expect(await getMigrationStatus(orm)).toEqual({ applied: 24, pending: 4 });
      await orm.em.getConnection().execute("update tenant set generation = 23 where code = 'prod'");
      await orm.migrator.up();
      expect(await getMigrationStatus(orm)).toEqual({ applied: 28, pending: 0 });
      expect(await orm.em.getConnection().execute("select generation from tenant where code = 'prod'")).toEqual([{ generation: 23 }]);
      expect(await orm.em.getConnection().execute("select count(*) as count from stock_movement")).toEqual([{ count: 0 }]);
      expect(await orm.em.getConnection().execute("select count(*) as count from customer_order")).toEqual([{ count: 0 }]);
      // Existing tenant defaults/audit triggers have baseline diff noise; neither aggregate needs schema changes.
      expect(await orm.schema.getUpdateSchemaSQL()).not.toMatch(/customer_order|stock_balance|stock_movement/);
    } finally {
      await orm.close();
    }
  });
  it("adopts the production-order migration after a database already running the main-branch transfers", async () => {
    const orm = await initOrm({ databasePath: tempDatabase() });
    try {
      // Production applied transfers first, although production orders carry the earlier timestamp.
      const previous = migrations.map((migration) => migration.name).filter((name) => !name.includes("production_"));
      await orm.migrator.up({ migrations: previous });
      expect(await getMigrationStatus(orm)).toEqual({ applied: 26, pending: 2 });
      await orm.migrator.up();
      expect(await getMigrationStatus(orm)).toEqual({ applied: 28, pending: 0 });
      expect(await orm.em.getConnection().execute("select count(*) as count from production_order")).toEqual([{ count: 0 }]);
      expect(await orm.em.getConnection().execute("select count(*) as count from transfer")).toEqual([{ count: 0 }]);
      expect(await orm.schema.getUpdateSchemaSQL()).not.toMatch(/production_order|transfer/);
    } finally {
      await orm.close();
    }
  });
});

describe("getMigrationStatus", () => {
  it("counts applied and pending migrations, including on a never-migrated database", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      expect(await getMigrationStatus(orm)).toEqual({ applied: 0, pending: 28 });
      await orm.migrator.up();
      expect(await getMigrationStatus(orm)).toEqual({ applied: 28, pending: 0 });
    } finally {
      await orm.close();
    }
  });
});

describe("migrations", () => {
  it("can be rolled back, one at a time", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const tables = async () =>
      (
        await orm.em
          .getConnection()
          .execute<{ name: string }[]>(
            "select name from sqlite_master where name in ('setting', 'user', 'session', 'user_preference', 'tenant', 'api_token', 'global_audit_event', 'tenant_audit_event', 'global_idempotency_key', 'tenant_idempotency_key', 'material', 'material_conversion', 'location', 'customer', 'supplier', 'planning_parameter_set', 'safety_stock_target', 'bom', 'bom_revision', 'bom_component', 'customer_order', 'customer_order_line', 'stock_balance', 'stock_movement', 'stock_reversal', 'transfer_reversal', 'forecast', 'purchase_requisition', 'purchase_order', 'purchase_order_line', 'goods_receipt', 'goods_receipt_line', 'production_order', 'transfer', 'transfer_posting', 'shipment', 'shipment_line', 'goods_issue', 'goods_issue_line', 'production_completion', 'production_completion_line')",
          )
      )
        .map(({ name }) => name)
        .sort();

    const userColumns = async () =>
      (await orm.em.getConnection().execute<{ name: string }[]>("select name from pragma_table_info('user')"))
        .map(({ name }) => name)
        .sort();

    const tenantColumns = async () =>
      (await orm.em.getConnection().execute<{ name: string }[]>("select name from pragma_table_info('tenant')"))
        .map(({ name }) => name)
        .sort();

    const triggers = async () =>
      (await orm.em.getConnection().execute<{ name: string }[]>("select name from sqlite_master where type = 'trigger'"))
        .map(({ name }) => name)
        .sort();

    try {
      expect(await tables()).toEqual([
        "api_token",
        "bom",
        "bom_component",
        "bom_revision",
        "customer",
        "customer_order",
        "customer_order_line",
        "forecast",
        "global_audit_event",
        "global_idempotency_key",
        "goods_issue",
        "goods_issue_line",
        "goods_receipt",
        "goods_receipt_line",
        "location",
        "material",
        "material_conversion",
        "planning_parameter_set",
        "production_completion",
        "production_completion_line",
        "production_order",
        "purchase_order",
        "purchase_order_line",
        "purchase_requisition",
        "safety_stock_target",
        "session",
        "setting",
        "shipment",
        "shipment_line",
        "stock_balance",
        "stock_movement",
        "stock_reversal",
        "supplier",
        "tenant",
        "tenant_audit_event",
        "tenant_idempotency_key",
        "transfer",
        "transfer_posting",
        "transfer_reversal",
        "user",
        "user_preference",
      ]);
      expect(await triggers()).toContain("stock_movement_no_update");
      expect(await triggers()).toContain("transfer_posting_no_update");
      expect(await triggers()).toContain("goods_receipt_no_update");
      expect(await triggers()).toContain("goods_issue_no_update");
      expect(await triggers()).toContain("goods_issue_line_no_update");
      expect(await triggers()).toContain("production_completion_no_update");
      expect(await triggers()).toContain("production_completion_line_no_update");
      const plan = await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan select l.id from customer_order_line l join customer_order o on l.order_id = o.id
        where l.tenant_code = ? and l.material_id = ? and l.removed = 0 and l.status = 'open' and l.id > ?
        and o.tenant_code = ? and o.status = 'open' order by l.id limit 100`, ["test", "material", "cursor", "test"]);
      expect(plan.map(({ detail }) => detail).join(" ")).toContain("customer_order_line_tenant_code_material_id_removed_status_id_index");
      expect(plan.map(({ detail }) => detail).join(" ")).not.toContain("TEMP B-TREE");
      const shipmentPlan = await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan select * from shipment
        where tenant_code = ? and order_id = ? and status in ('open', 'completed') and code > ? order by code limit 100`, ["prod", "order", "00000100"]);
      expect(shipmentPlan.map(({ detail }) => detail).join(" ")).toContain("shipment_tenant_code_order_id_code_index (tenant_code=? AND order_id=? AND code>?)");
      expect(shipmentPlan.map(({ detail }) => detail).join(" ")).not.toContain("TEMP B-TREE");
      expect(await tables()).toContain("transfer_reversal");
      expect(await triggers()).toContain("transfer_reversal_no_update");
      await orm.migrator.down();
      expect(await tables()).not.toContain("transfer_reversal");
      expect(await triggers()).not.toContain("transfer_reversal_no_update");
      expect(await tables()).toContain("transfer_posting");
      await orm.migrator.down();
      expect(await orm.em.getConnection().execute("select name from sqlite_master where name = 'shipment_tenant_code_order_id_code_index'")).toEqual([]);
      expect(await tables()).toContain("shipment");
      await orm.migrator.down();
      expect(await tables()).not.toContain("stock_reversal");
      expect(await triggers()).not.toContain("stock_reversal_no_update");
      await orm.migrator.down(); // Document lifecycle.
      await orm.migrator.down();
      expect((await tables()).filter((name) => name.startsWith("production_completion"))).toEqual([]);
      expect(await triggers()).not.toContain("production_completion_no_update");
      expect(await triggers()).not.toContain("production_completion_line_no_update");
      expect(await tables()).toContain("production_order");
      await orm.migrator.down();
      expect((await tables()).filter((name) => name.startsWith("goods_issue") || name.startsWith("shipment"))).toEqual([]);
      expect(await triggers()).not.toContain("goods_issue_no_update");
      expect(await triggers()).not.toContain("goods_issue_line_no_update");
      expect(await tables()).toContain("customer_order_line");
      await orm.migrator.down();
      expect((await tables()).filter((name) => name.startsWith("transfer"))).toEqual([]);
      expect(await triggers()).not.toContain("transfer_posting_no_update");
      expect(await tables()).toContain("production_order");
      await orm.migrator.down();
      expect(await tables()).not.toContain("production_order");
      expect(await tables()).toContain("goods_receipt");
      await orm.migrator.down();
      expect((await tables()).filter((name) => name.startsWith("goods_receipt"))).toEqual([]);
      expect(await triggers()).not.toContain("goods_receipt_no_update");
      expect(await tables()).toContain("purchase_order_line");
      await orm.migrator.down();
      expect((await tables()).filter((name) => name.startsWith("purchase"))).toEqual([]);
      await orm.migrator.down();
      expect(await orm.em.getConnection().execute("select name from sqlite_master where type = 'index' and name = 'customer_order_line_tenant_code_material_id_removed_status_id_index'")).toEqual([]);
      expect(await tables()).toContain("customer_order_line");
      await orm.migrator.down(); // Test reset audit exception.
      await orm.migrator.down();
      expect(await triggers()).not.toContain("stock_movement_no_update");
      expect(await tables()).not.toContain("stock_balance");
      expect(await tables()).not.toContain("stock_movement");
      await orm.migrator.down();
      expect(await tables()).not.toContain("customer_order");
      expect(await tables()).not.toContain("customer_order_line");
      expect(await triggers()).toContain("bom_revision_no_update");
      await orm.migrator.down();
      expect(await tables()).not.toContain("forecast");
      expect(await tables()).toContain("bom");
      await orm.migrator.down();
      expect(await triggers()).not.toContain("bom_revision_no_update");
      expect(await triggers()).not.toContain("bom_component_no_update");
      expect(await tables()).toEqual([
        "api_token",
        "customer",
        "global_audit_event",
        "global_idempotency_key",
        "location",
        "material",
        "material_conversion",
        "planning_parameter_set",
        "safety_stock_target",
        "session",
        "setting",
        "supplier",
        "tenant",
        "tenant_audit_event",
        "tenant_idempotency_key",
        "user",
        "user_preference",
      ]);
      await orm.migrator.down();
      expect(await tables()).toEqual([
        "api_token",
        "customer",
        "global_audit_event",
        "global_idempotency_key",
        "location",
        "material",
        "material_conversion",
        "session",
        "setting",
        "supplier",
        "tenant",
        "tenant_audit_event",
        "tenant_idempotency_key",
        "user",
        "user_preference",
      ]);
      expect(await tenantColumns()).toEqual(["code", "generation", "read_only"]);
      await orm.migrator.down();
      expect(await tenantColumns()).toEqual(["code", "generation"]);
      await orm.migrator.down();
      expect(await tables()).toEqual([
        "api_token",
        "global_audit_event",
        "global_idempotency_key",
        "material",
        "material_conversion",
        "session",
        "setting",
        "tenant",
        "tenant_audit_event",
        "tenant_idempotency_key",
        "user",
        "user_preference",
      ]);
      await orm.migrator.down();
      expect(await tables()).toEqual([
        "api_token",
        "global_audit_event",
        "global_idempotency_key",
        "session",
        "setting",
        "tenant",
        "tenant_audit_event",
        "tenant_idempotency_key",
        "user",
        "user_preference",
      ]);
      expect(await userColumns()).toEqual(["active", "created_at", "id", "password_hash", "role", "username", "version"]);
      await orm.migrator.down();
      expect(await userColumns()).toEqual(["active", "created_at", "id", "password_hash", "role", "username"]);
      expect(await tables()).toEqual([
        "api_token",
        "global_audit_event",
        "session",
        "setting",
        "tenant",
        "tenant_audit_event",
        "user",
        "user_preference",
      ]);
      await orm.migrator.down();
      expect(await tables()).toEqual([
        "global_audit_event",
        "session",
        "setting",
        "tenant",
        "tenant_audit_event",
        "user",
        "user_preference",
      ]);
      expect(await triggers()).toEqual([
        "global_audit_event_no_delete",
        "global_audit_event_no_update",
        "tenant_audit_event_no_delete",
        "tenant_audit_event_no_update",
      ]);
      await orm.migrator.down();
      expect(await triggers()).toEqual([]);
      expect(await tables()).toEqual(["session", "setting", "tenant", "user", "user_preference"]);
      expect(await userColumns()).toEqual(["active", "created_at", "id", "password_hash", "role", "username"]);
      await orm.migrator.down();
      expect(await userColumns()).toEqual(["created_at", "id", "role", "username"]);
      expect(await tables()).toEqual(["session", "setting", "tenant", "user", "user_preference"]);
      await orm.migrator.down();
      expect(await tables()).toEqual(["session", "setting", "user", "user_preference"]);
      await orm.migrator.down();
      expect(await tables()).toEqual(["session", "setting", "user"]);
      await orm.migrator.down();
      expect(await tables()).toEqual(["setting"]);
      await orm.migrator.down();
      expect(await tables()).toEqual([]);
    } finally {
      await orm.close();
    }
  });
});

describe("users-password-active migration", () => {
  it("keeps the existing admin row active, with no password hash", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      await orm.migrator.up({ to: "Migration20261019092708_tenants" });
      await orm.em
        .getConnection()
        .execute("insert into user (id, username, role, created_at) values ('a1', 'admin', 'admin', 0)");
      await orm.migrator.up();

      expect(
        await orm.em.getConnection().execute("select username, active, password_hash from user"),
      ).toEqual([{ username: "admin", active: 1, password_hash: null }]);
    } finally {
      await orm.close();
    }
  });
});

describe("materials migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("keeps material IDs unique per tenant and units unique per material, and rolls back with rows", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const material = (id: string, tenant: string, code: string) =>
      execute(
        orm,
        `insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('${id}', '${tenant}', '${code}', 'raw', 'x', 'kg', 0)`,
      );
    const conversion = (id: string, unit: string) =>
      execute(
        orm,
        `insert into material_conversion (id, tenant_code, material_id, unit, numerator, denominator) values ('${id}', 'test', 'm1', '${unit}', '1000', '1')`,
      );

    try {
      await material("m1", "test", "00000001");
      await material("m2", "prod", "00000001");
      await expect(material("m3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      await conversion("c1", "t");
      await conversion("c2", "T");
      await expect(conversion("c3", "t")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select numerator, typeof(numerator) as kind from material_conversion where id = 'c1'")).toEqual([
        { numerator: "1000", kind: "text" },
      ]);

      await orm.migrator.down({ to: "Migration20261019155802_api_idempotency" });
      expect(await execute(orm, "select name from sqlite_master where name like 'material%'")).toEqual([]);
    } finally {
      await orm.close();
    }
  });
});

describe("locations, customers and suppliers migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it.each(["location", "customer", "supplier"])("keeps %s IDs unique per tenant, and rolls back with rows", async (table) => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const insert = (id: string, tenant: string, code: string) =>
      execute(orm, `insert into ${table} (id, tenant_code, code, name, created_at) values ('${id}', '${tenant}', '${code}', 'x', 0)`);

    try {
      await insert("r1", "test", "00000001");
      await insert("r2", "prod", "00000001");
      await expect(insert("r3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, `select active, version from ${table} where id = 'r1'`)).toEqual([{ active: 1, version: 1 }]);

      await orm.migrator.down({ to: "Migration20261019191302_materials" });
      expect(await execute(orm, "select name from sqlite_master where name in ('location', 'customer', 'supplier')")).toEqual([]);
      expect(await execute(orm, "select name from sqlite_master where name = 'material'")).toEqual([{ name: "material" }]);
    } finally {
      await orm.close();
    }
  });
});

describe("tenant-read-only migration", () => {
  it("leaves both existing tenants writable, and drops the flag on the way down", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });
    const flags = () => orm.em.getConnection().execute("select code, read_only from tenant order by code desc");

    try {
      await orm.migrator.up({ to: "Migration20261019202843_locations_customers_suppliers" });
      await orm.migrator.up({ to: "Migration20261019211303_tenant_read_only" });
      expect(await flags()).toEqual([
        { code: "test", read_only: 0 },
        { code: "prod", read_only: 0 },
      ]);

      await orm.migrator.down();
      expect(await orm.em.getConnection().execute("select * from tenant order by code desc")).toEqual([
        { code: "test", generation: 1 },
        { code: "prod", generation: 1 },
      ]);
    } finally {
      await orm.close();
    }
  });
});

describe("planning-parameters and safety-stock migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("keeps one set per material and location and one target per date, and rolls back with rows", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const material = (id: string) =>
      execute(orm, `insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('${id}', 'test', '${id}', 'raw', 'x', 'kg', 0)`);
    const location = (id: string) =>
      execute(orm, `insert into location (id, tenant_code, code, name, created_at) values ('${id}', 'test', '${id}', 'x', 0)`);
    const set = (id: string, materialId: string, locationId: string, procurement = "buy") =>
      execute(
        orm,
        `insert into planning_parameter_set (id, tenant_code, material_id, location_id, procurement, lead_time_days, minimum_quantity, lot_multiple) values ('${id}', 'test', '${materialId}', '${locationId}', '${procurement}', 7, '10.000000', '6.000000')`,
      );
    const target = (id: string, date: string) =>
      execute(
        orm,
        `insert into safety_stock_target (id, tenant_code, material_id, location_id, effective_from, quantity) values ('${id}', 'test', 'm1', 'l1', '${date}', '100.000000')`,
      );

    try {
      await material("m1");
      await location("l1");
      await location("l2");
      await set("s1", "m1", "l1");
      await set("s2", "m1", "l2");
      await expect(set("s3", "m1", "l1")).rejects.toThrow(/UNIQUE/);
      await expect(set("s4", "m1", "l2", "lease")).rejects.toThrow(/CHECK/);
      expect(await execute(orm, "select lead_time_days, minimum_quantity, typeof(minimum_quantity) as kind, version from planning_parameter_set where id = 's1'")).toEqual([
        { lead_time_days: 7, minimum_quantity: "10.000000", kind: "text", version: 1 },
      ]);

      await target("t1", "2027-01-01");
      await target("t2", "2027-02-01");
      await expect(target("t3", "2027-01-01")).rejects.toThrow(/UNIQUE/);

      await orm.migrator.down({ to: "Migration20261019211303_tenant_read_only" });
      expect(await execute(orm, "select name from sqlite_master where name in ('planning_parameter_set', 'safety_stock_target')")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from material")).toEqual([{ n: 1 }]);
    } finally {
      await orm.close();
    }
  });
});

describe("forecasts migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("keeps one forecast per material, location and day, and rolls back with rows", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const forecast = (id: string, date: string, location = "l1") =>
      execute(
        orm,
        `insert into forecast (id, tenant_code, material_id, location_id, date, quantity) values ('${id}', 'test', 'm1', '${location}', '${date}', '100.000000')`,
      );

    try {
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', 'm1', 'finished', 'x', 'each', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', 'l1', 'x', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l2', 'test', 'l2', 'x', 0)");

      await forecast("f1", "2027-01-01");
      await forecast("f2", "2027-01-02");
      await forecast("f3", "2027-01-01", "l2");
      await expect(forecast("f4", "2027-01-01")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select quantity, typeof(quantity) as kind, version from forecast where id = 'f1'")).toEqual([
        { quantity: "100.000000", kind: "text", version: 1 },
      ]);

      // The migrations that landed after the forecasts come off first.
      for (let later = 0; later < 14; later += 1) await orm.migrator.down();
      expect(await execute(orm, "select name from sqlite_master where name = 'forecast'")).toEqual([{ name: "forecast" }]);
      await orm.migrator.down();
      expect(await execute(orm, "select name from sqlite_master where name = 'forecast'")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from material")).toEqual([{ n: 1 }]);
    } finally {
      await orm.close();
    }
  });
});

describe("boms migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("keeps BOM IDs unique per tenant, revisions and lines unique and unchangeable, and rolls back", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const bom = (id: string, tenant: string, code: string) =>
      execute(
        orm,
        `insert into bom (id, tenant_code, code, output_id, revision, created_at) values ('${id}', '${tenant}', '${code}', 'm1', 1, 0)`,
      );
    const revision = (id: string, number: number) =>
      execute(
        orm,
        `insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, valid_through, created_at) values ('${id}', 'test', 'b1', ${number}, 1, '2026-01-01', null, 0)`,
      );
    const line = (id: string, material: string) =>
      execute(
        orm,
        `insert into bom_component (id, tenant_code, revision_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator) values ('${id}', 'test', 'r1', 0, '${material}', '24.000000', '2', 'case', '12', '1')`,
      );

    try {
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'finished', 'x', 'each', 0)");
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m2', 'test', '00000002', 'raw', 'y', 'each', 0)");
      await bom("b1", "test", "00000001");
      await bom("b2", "prod", "00000001");
      await expect(bom("b3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select active, version from bom where id = 'b1'")).toEqual([{ active: 1, version: 1 }]);

      await revision("r1", 1);
      await expect(revision("r2", 1)).rejects.toThrow(/UNIQUE/);
      await line("l1", "m2");
      await expect(line("l2", "m2")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select quantity, typeof(quantity) as kind from bom_component")).toEqual([{ quantity: "24.000000", kind: "text" }]);

      await expect(execute(orm, "update bom_revision set priority = 2")).rejects.toThrow(BOM_REVISION_IMMUTABLE);
      await expect(execute(orm, "update bom_component set quantity = '1'")).rejects.toThrow(BOM_REVISION_IMMUTABLE);
      await execute(orm, "update bom set active = 0 where id = 'b1'");

      await execute(orm, "delete from bom_component");
      await execute(orm, "delete from bom_revision");
      await execute(orm, "delete from bom");
      await orm.migrator.down({ to: "Migration20261020054509_planning_parameters_safety_stock" });
      expect(await execute(orm, "select name from sqlite_master where name like 'bom%'")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from material")).toEqual([{ n: 2 }]);
    } finally {
      await orm.close();
    }
  });
});

describe("purchasing migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("keeps document IDs unique per tenant and line numbers unique per order, and rolls back", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const requisition = (id: string, tenant: string, code: string) =>
      execute(
        orm,
        `insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, created_at) values ('${id}', '${tenant}', '${code}', 'm1', 'l1', '100.000000', '100', 'each', '1', '1', '2026-11-02', '0.000000', 0)`,
      );
    const order = (id: string, tenant: string, code: string) =>
      execute(
        orm,
        `insert into purchase_order (id, tenant_code, code, supplier_id, location_id, created_at, updated_at) values ('${id}', '${tenant}', '${code}', 's1', 'l1', 0, 0)`,
      );
    const line = (id: string, position: number) =>
      execute(
        orm,
        `insert into purchase_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_date, requisition_id) values ('${id}', 'test', 'o1', ${position}, 'm1', '60.000000', '60', 'each', '1', '1', '2026-11-04', null)`,
      );

    try {
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'raw', 'x', 'each', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0)");
      await execute(orm, "insert into supplier (id, tenant_code, code, name, created_at) values ('s1', 'test', '00000001', 'Acme', 0)");

      await requisition("r1", "test", "00000001");
      await requisition("r2", "prod", "00000001");
      await expect(requisition("r3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select status, version, converted from purchase_requisition where id = 'r1'")).toEqual([
        { status: "open", version: 1, converted: "0.000000" },
      ]);

      await order("o1", "test", "00000001");
      await order("o2", "prod", "00000001");
      await expect(order("o3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select status, version from purchase_order where id = 'o1'")).toEqual([{ status: "open", version: 1 }]);

      await line("l1", 1);
      await line("l2", 2);
      await expect(line("l3", 2)).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select quantity, typeof(quantity) as kind from purchase_order_line where id = 'l1'")).toEqual([
        { quantity: "60.000000", kind: "text" },
      ]);

      await execute(orm, "delete from purchase_order_line");
      await execute(orm, "delete from purchase_order");
      await execute(orm, "delete from purchase_requisition");
      await orm.migrator.down(); // Transfer reversals.
      await orm.migrator.down(); // Shipment order cursor index.
      await orm.migrator.down(); // Stock reversals.
      await orm.migrator.down(); // Document lifecycle.
      await orm.migrator.down(); // Production completions.
      await orm.migrator.down(); // Shipments and goods issues, which landed after purchasing.
      await orm.migrator.down(); // Transfers, which landed after purchasing.
      await orm.migrator.down(); // Production orders.
      await orm.migrator.down(); // Goods receipts, which landed after purchasing.
      await orm.migrator.down();
      expect(await execute(orm, "select name from sqlite_master where name like 'purchase%'")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from material")).toEqual([{ n: 1 }]);
    } finally {
      await orm.close();
    }
  });
});

describe("goods-receipts migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("starts every order line at nothing received, keeps receipt IDs unique per tenant and receipts immutable, and rolls back", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const receipt = (id: string, tenant: string, code: string) =>
      execute(orm, `insert into goods_receipt (id, tenant_code, code, order_id, business_date, created_at) values ('${id}', '${tenant}', '${code}', 'o1', '2026-10-20', 0)`);
    const line = (id: string, position: number) =>
      execute(
        orm,
        `insert into goods_receipt_line (id, tenant_code, receipt_id, position, order_line_id, quantity, entered_quantity, entered_unit, numerator, denominator) values ('${id}', 'test', 'g1', ${position}, 'ol1', '30.000000', '30', 'each', '1', '1')`,
      );

    try {
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'raw', 'x', 'each', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0)");
      await execute(orm, "insert into supplier (id, tenant_code, code, name, created_at) values ('s1', 'test', '00000001', 'Acme', 0)");
      await execute(orm, "insert into purchase_order (id, tenant_code, code, supplier_id, location_id, created_at, updated_at) values ('o1', 'test', '00000001', 's1', 'l1', 0, 0)");
      await execute(
        orm,
        "insert into purchase_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_date) values ('ol1', 'test', 'o1', 1, 'm1', '100.000000', '100', 'each', '1', '1', '2026-11-04')",
      );
      expect(await execute(orm, "select received, typeof(received) as kind from purchase_order_line")).toEqual([{ received: "0.000000", kind: "text" }]);

      await receipt("g1", "test", "00000001");
      await receipt("g2", "prod", "00000001");
      await expect(receipt("g3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      await line("gl1", 0);
      await expect(line("gl2", 0)).rejects.toThrow(/UNIQUE/);
      await expect(execute(orm, "update goods_receipt set business_date = '2026-10-01'")).rejects.toThrow(GOODS_RECEIPT_IMMUTABLE);
      await expect(execute(orm, "update goods_receipt_line set quantity = '1.000000'")).rejects.toThrow(GOODS_RECEIPT_IMMUTABLE);

      await orm.migrator.down(); // Transfer reversals.
      await orm.migrator.down(); // Shipment order cursor index.
      await orm.migrator.down(); // Stock reversals.
      await orm.migrator.down(); // Document lifecycle.
      await orm.migrator.down(); // Production completions.
      await orm.migrator.down(); // Shipments and goods issues, which landed after goods receipts.
      await orm.migrator.down(); // Transfers, which landed after goods receipts.
      await orm.migrator.down(); // Production orders.
      await orm.migrator.down();
      expect(await execute(orm, "select name from sqlite_master where name like 'goods_receipt%'")).toEqual([]);
      expect(await execute(orm, "select name from pragma_table_info('purchase_order_line') where name = 'received'")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from purchase_order_line")).toEqual([{ n: 1 }]);
    } finally {
      await orm.close();
    }
  });
});

describe("transfers migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("starts a transfer open with nothing moved, keeps transfer IDs unique per tenant and postings immutable, and rolls back with postings", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const transfer = (id: string, tenant: string, code: string) =>
      execute(
        orm,
        `insert into transfer (id, tenant_code, code, material_id, source_id, destination_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_dispatch, planned_arrival, created_at, updated_at) values ('${id}', '${tenant}', '${code}', 'm1', 'l1', 'l2', '100.000000', '100', 'each', '1', '1', '2026-10-21', '2026-10-23', 0, 0)`,
      );

    try {
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'raw', 'x', 'each', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l2', 'test', '00000002', 'Depot', 0)");

      await transfer("t1", "test", "00000001");
      await transfer("t2", "prod", "00000001");
      await expect(transfer("t3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select dispatched, received, written_off, typeof(dispatched) as kind, status, version from transfer where id = 't1'")).toEqual([
        { dispatched: "0.000000", received: "0.000000", written_off: "0.000000", kind: "text", status: "open", version: 1 },
      ]);
      await execute(
        orm,
        "insert into transfer_posting (id, tenant_code, transfer_id, kind, business_date, occurred_at, quantity, entered_quantity, entered_unit, numerator, denominator, transit_before, transit_after, reason, actor_user_id, actor_username, channel) values ('p1', 'test', 't1', 'dispatch', '2026-10-21', 0, '60.000000', '60', 'each', '1', '1', '0.000000', '60.000000', 'Transfer 00000001 dispatch', null, 'admin', 'ui')",
      );
      await expect(execute(orm, "update transfer_posting set quantity = '1.000000'")).rejects.toThrow(TRANSFER_POSTING_IMMUTABLE);
      await expect(
        execute(
          orm,
          "insert into transfer_posting (id, tenant_code, transfer_id, kind, business_date, occurred_at, quantity, entered_quantity, entered_unit, numerator, denominator, transit_before, transit_after, reason, actor_user_id, actor_username, channel) values ('p2', 'test', 't1', 'loss', '2026-10-21', 0, '1.000000', '1', 'each', '1', '1', '0.000000', '0.000000', 'x', null, 'admin', 'ui')",
        ),
      ).rejects.toThrow(/CHECK/);

      // Rolls back with postings still in place: they are dropped before the transfers they reference.
      await orm.migrator.down(); // Transfer reversals.
      await orm.migrator.down(); // Shipment order cursor index.
      await orm.migrator.down(); // Stock reversals.
      await orm.migrator.down(); // Document lifecycle.
      await orm.migrator.down(); // Production completions.
      await orm.migrator.down(); // Shipments and goods issues, which landed after transfers.
      await orm.migrator.down();
      expect(await execute(orm, "select name from sqlite_master where name like 'transfer%'")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from location")).toEqual([{ n: 2 }]);
    } finally {
      await orm.close();
    }
  });
});

describe("shipments and goods-issues migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("starts every shipment Open and every shipment line at nothing issued, keeps IDs unique per tenant and issues immutable, and rolls back", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const shipment = (id: string, tenant: string, code: string) =>
      execute(orm, `insert into shipment (id, tenant_code, code, order_id, planned_date, created_at) values ('${id}', '${tenant}', '${code}', 'o1', '2026-10-25', 0)`);
    const issue = (id: string, tenant: string, code: string) =>
      execute(orm, `insert into goods_issue (id, tenant_code, code, shipment_id, business_date, created_at) values ('${id}', '${tenant}', '${code}', 's1', '2026-10-20', 0)`);

    try {
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'raw', 'x', 'each', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0)");
      await execute(orm, "insert into customer (id, tenant_code, code, name, created_at) values ('c1', 'test', '00000001', 'Acme', 0)");
      await execute(orm, "insert into customer_order (id, tenant_code, code, customer_id, location_id, created_at, updated_at, version) values ('o1', 'test', '00000001', 'c1', 'l1', 0, 0, 1)");
      await execute(
        orm,
        "insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date) values ('ol1', 'test', 'o1', 0, 'm1', '60.000000', '60', 'each', '1', '1', '2026-11-04')",
      );
      await shipment("s1", "test", "00000001");
      await shipment("s2", "prod", "00000001");
      await expect(shipment("s3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select status from shipment where id = 's1'")).toEqual([{ status: "open" }]);
      await execute(
        orm,
        "insert into shipment_line (id, tenant_code, shipment_id, position, order_line_id, quantity, entered_quantity, entered_unit, numerator, denominator) values ('sl1', 'test', 's1', 0, 'ol1', '60.000000', '60', 'each', '1', '1')",
      );
      expect(await execute(orm, "select issued, typeof(issued) as kind from shipment_line")).toEqual([{ issued: "0.000000", kind: "text" }]);

      await issue("g1", "test", "00000001");
      await issue("g2", "prod", "00000001");
      await expect(issue("g3", "test", "00000001")).rejects.toThrow(/UNIQUE/);
      await execute(
        orm,
        "insert into goods_issue_line (id, tenant_code, issue_id, position, shipment_line_id, quantity, entered_quantity, entered_unit, numerator, denominator) values ('gl1', 'test', 'g1', 0, 'sl1', '20.000000', '20', 'each', '1', '1')",
      );
      await expect(execute(orm, "update goods_issue set business_date = '2026-10-01'")).rejects.toThrow(GOODS_ISSUE_IMMUTABLE);
      await expect(execute(orm, "update goods_issue_line set quantity = '1.000000'")).rejects.toThrow(GOODS_ISSUE_IMMUTABLE);
      await execute(orm, "update shipment_line set issued = '20.000000'");
      await execute(orm, "update shipment set status = 'completed'");

      await orm.migrator.down(); // Transfer reversals.
      await orm.migrator.down(); // Shipment order cursor index.
      await orm.migrator.down(); // Stock reversals.
      await orm.migrator.down(); // Document lifecycle.
      await orm.migrator.down(); // Production completions.
      await orm.migrator.down();
      expect(await execute(orm, "select name from sqlite_master where name like 'shipment%' or name like 'goods_issue%'")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from customer_order_line")).toEqual([{ n: 1 }]);
    } finally {
      await orm.close();
    }
  });
});

describe("production-completions migration", () => {
  const execute = (orm: Awaited<ReturnType<typeof initOrm>>, sql: string) => orm.em.getConnection().execute(sql);

  it("keeps completion IDs and UI submissions unique per tenant, lines unique per completion, both immutable, and rolls back", async () => {
    const databasePath = tempDatabase();
    await migrate({ databasePath });
    const orm = await initOrm({ databasePath });
    const completion = (id: string, tenant: string, code: string, submission: string | null) =>
      execute(
        orm,
        `insert into production_completion (id, tenant_code, code, order_id, business_date, quantity, entered_quantity, entered_unit, numerator, denominator, submission, created_at) values ('${id}', '${tenant}', '${code}', 'po1', '2026-10-20', '40.000000', '40', 'each', '1', '1', ${submission === null ? "null" : `'${submission}'`}, 0)`,
      );
    const line = (id: string, position: number, material: string) =>
      execute(
        orm,
        `insert into production_completion_line (id, tenant_code, completion_id, position, material_id, expected, actual, variance, entered_quantity, entered_unit, numerator, denominator, extra) values ('${id}', 'test', 'c1', ${position}, '${material}', '20.000000', '18.000000', '-2.000000', '18', 'kg', '1', '1', 0)`,
      );

    try {
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'test', '00000001', 'finished', 'Bar', 'each', 0)");
      await execute(orm, "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m2', 'test', '00000002', 'raw', 'Cocoa', 'kg', 0)");
      await execute(orm, "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'test', '00000001', 'Plant', 0)");
      await execute(orm, "insert into bom (id, tenant_code, code, output_id, revision, created_at) values ('b1', 'test', '00000001', 'm1', 1, 0)");
      await execute(
        orm,
        "insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, valid_through, created_at) values ('r1', 'test', 'b1', 1, 1, '2026-01-01', null, 0)",
      );
      await execute(
        orm,
        "insert into production_order (id, tenant_code, code, output_id, location_id, recipe_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_finish, planned_start, lead_time_days, created_at, updated_at) values ('po1', 'test', '00000001', 'm1', 'l1', 'r1', '100.000000', '100', 'each', '1', '1', '2026-11-02', '2026-10-30', 3, 0, 0)",
      );

      await completion("c1", "test", "00000001", "11111111-1111-4111-8111-111111111111");
      await completion("c2", "prod", "00000001", "11111111-1111-4111-8111-111111111111");
      await completion("c3", "test", "00000002", null);
      await completion("c4", "test", "00000003", null);
      await expect(completion("c5", "test", "00000001", null)).rejects.toThrow(/UNIQUE/);
      await expect(completion("c6", "test", "00000004", "11111111-1111-4111-8111-111111111111")).rejects.toThrow(/UNIQUE/);
      await line("cl1", 0, "m2");
      await expect(line("cl2", 0, "m1")).rejects.toThrow(/UNIQUE/);
      await expect(line("cl3", 1, "m2")).rejects.toThrow(/UNIQUE/);
      expect(await execute(orm, "select actual, variance, typeof(variance) as kind from production_completion_line")).toEqual([
        { actual: "18.000000", variance: "-2.000000", kind: "text" },
      ]);
      await expect(execute(orm, "update production_completion set quantity = '1.000000'")).rejects.toThrow(PRODUCTION_COMPLETION_IMMUTABLE);
      await expect(execute(orm, "update production_completion_line set actual = '1.000000'")).rejects.toThrow(PRODUCTION_COMPLETION_IMMUTABLE);

      await orm.migrator.down(); // Transfer reversals.
      await orm.migrator.down(); // Shipment order cursor index.
      await orm.migrator.down(); // Stock reversals.
      await orm.migrator.down(); // Document lifecycle.
      await orm.migrator.down();
      expect(await execute(orm, "select name from sqlite_master where name like 'production_completion%'")).toEqual([]);
      expect(await execute(orm, "select count(*) as n from production_order")).toEqual([{ n: 1 }]);
    } finally {
      await orm.close();
    }
  });
});
