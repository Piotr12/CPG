import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOM_REVISION_IMMUTABLE } from "./entities";
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
    ]);
    expect(await migrate({ databasePath })).toEqual([]);
  });
});

describe("getMigrationStatus", () => {
  it("counts applied and pending migrations, including on a never-migrated database", async () => {
    const databasePath = tempDatabase();
    const orm = await initOrm({ databasePath });

    try {
      expect(await getMigrationStatus(orm)).toEqual({ applied: 0, pending: 14 });
      await orm.migrator.up();
      expect(await getMigrationStatus(orm)).toEqual({ applied: 14, pending: 0 });
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
            "select name from sqlite_master where name in ('setting', 'user', 'session', 'user_preference', 'tenant', 'api_token', 'global_audit_event', 'tenant_audit_event', 'global_idempotency_key', 'tenant_idempotency_key', 'material', 'material_conversion', 'location', 'customer', 'supplier', 'planning_parameter_set', 'safety_stock_target', 'bom', 'bom_revision', 'bom_component', 'forecast')",
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
        "forecast",
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
