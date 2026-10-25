import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initOrm, selectTenant, type EntityManager, type Orm } from "@cpg/db";
import { CustomerOrderService } from "./customer-orders/customer-order.service";
import { ProductionOrderService } from "./production-orders/production-order.service";
import { PurchaseOrderService } from "./purchase-orders/purchase-order.service";
import { PurchaseRequisitionService } from "./purchase-requisitions/purchase-requisition.service";
import { TransferService } from "./transfers/transfer.service";
import { ORDER_PAGE_SIZE } from "../validators/customer-orders/customer-order.schema";
import { PRODUCTION_PAGE_SIZE } from "../validators/production-orders/production-order.schema";
import { DOCUMENT_PAGE_SIZE } from "../validators/shipments/shipment.schema";
import { TRANSFER_PAGE_SIZE } from "../validators/transfers/transfer.schema";

// One file for five concepts: it pins the query plans the #220 indexes exist for, so each paged
// list's date and status sorts read their page from an index, in both directions, instead of
// sorting every document of the tenant first (lesson 2026-10-25: EXPLAIN the query MikroORM really sends).

type Lister = (em: EntityManager, sort: string, dir: "asc" | "desc") => Promise<unknown>;
const LISTS: { table: string; list: Lister; page: number; sorts: Record<string, string> }[] = [
  {
    table: "production_order",
    list: (em, sort, dir) => new ProductionOrderService({ em }).list({ sort: sort as never, dir }),
    page: PRODUCTION_PAGE_SIZE,
    sorts: { finish: "planned_finish", start: "planned_start", status: "status" },
  },
  {
    table: "purchase_order",
    list: (em, sort, dir) => new PurchaseOrderService({ em }).list({ sort: sort as never, dir }),
    page: DOCUMENT_PAGE_SIZE,
    sorts: { status: "status" },
  },
  {
    table: "purchase_requisition",
    list: (em, sort, dir) => new PurchaseRequisitionService({ em }).list({ sort: sort as never, dir }),
    page: DOCUMENT_PAGE_SIZE,
    sorts: { requiredDate: "required_date", status: "status" },
  },
  {
    table: "customer_order",
    list: (em, sort, dir) => new CustomerOrderService({ em }).list({ sort: sort as never, dir }),
    page: ORDER_PAGE_SIZE,
    sorts: { status: "status" },
  },
  {
    table: "transfer",
    list: (em, sort, dir) => new TransferService({ em }).list({ sort: sort as never, dir }),
    page: TRANSFER_PAGE_SIZE,
    sorts: { plannedDispatch: "planned_dispatch", status: "status" },
  },
];
const CASES = LISTS.flatMap(({ table, list, page, sorts }) =>
  Object.entries(sorts).flatMap(([sort, column]) => (["asc", "desc"] as const).map((dir) => ({ table, list, page, sort, column, dir }))),
);

/** More documents than any of these lists shows on a page, so a seeded list fills its first page. */
const DOCUMENTS = 300;
const seq = `with recursive s(x) as (select 1 union all select x + 1 from s where x < ${DOCUMENTS})`;
const code = "printf('%08d', x)";
const status = "case x % 4 when 0 then 'open' when 1 then 'completed' when 2 then 'closed-early' else 'cancelled' end";
const date = "date('2026-01-01', '+' || (x * 7 % 90) || ' days')";
/** A few hundred documents per list, with dates and statuses in an order other than their IDs'. */
const SEED = [
  "insert into material (id, tenant_code, code, type, description, base_unit, created_at) values ('m1', 'prod', '00000001', 'finished', 'Cabinet', 'each', 0)",
  "insert into location (id, tenant_code, code, name, created_at) values ('l1', 'prod', '00000001', 'Plant', 0), ('l2', 'prod', '00000002', 'Store', 0)",
  "insert into supplier (id, tenant_code, code, name, created_at) values ('s1', 'prod', '00000001', 'Acme', 0)",
  "insert into customer (id, tenant_code, code, name, created_at) values ('c1', 'prod', '00000001', 'Acme', 0)",
  "insert into bom (id, tenant_code, code, output_id, revision, created_at) values ('b1', 'prod', '00000001', 'm1', 1, 0)",
  "insert into bom_revision (id, tenant_code, bom_id, number, priority, valid_from, created_at) values ('r1', 'prod', 'b1', 1, 1, '2026-01-01', 0)",
  `${seq} insert into production_order (id, tenant_code, code, output_id, location_id, recipe_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_finish, planned_start, lead_time_days, status, created_at, updated_at)
    select 'p' || x, 'prod', ${code}, 'm1', 'l1', 'r1', '1.000000', '1', 'each', '1', '1', ${date}, ${date}, 0, ${status}, 0, 0 from s`,
  `${seq} insert into purchase_order (id, tenant_code, code, supplier_id, location_id, status, created_at, updated_at) select 'o' || x, 'prod', ${code}, 's1', 'l1', ${status}, 0, 0 from s`,
  `insert into purchase_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_date)
    select 'ol' || id, 'prod', id, 0, 'm1', '1.000000', '1', 'each', '1', '1', '2026-05-01' from purchase_order`,
  `${seq} insert into purchase_requisition (id, tenant_code, code, material_id, location_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date, converted, status, created_at)
    select 'q' || x, 'prod', ${code}, 'm1', 'l1', '1.000000', '1', 'each', '1', '1', ${date}, '0.000000', ${status}, 0 from s`,
  `${seq} insert into customer_order (id, tenant_code, code, customer_id, location_id, status, created_at, updated_at) select 'co' || x, 'prod', ${code}, 'c1', 'l1', ${status}, 0, 0 from s`,
  `insert into customer_order_line (id, tenant_code, order_id, position, material_id, quantity, entered_quantity, entered_unit, numerator, denominator, required_date)
    select 'cl' || id, 'prod', id, 0, 'm1', '1.000000', '1', 'each', '1', '1', '2026-05-01' from customer_order`,
  `${seq} insert into transfer (id, tenant_code, code, material_id, source_id, destination_id, quantity, entered_quantity, entered_unit, numerator, denominator, planned_dispatch, planned_arrival, status, created_at, updated_at)
    select 't' || x, 'prod', ${code}, 'm1', 'l1', 'l2', '1.000000', '1', 'each', '1', '1', ${date}, ${date}, ${status}, 0, 0 from s`,
];

// Without statistics SQLite plans by the schema alone, as in production, which never runs ANALYZE.
// With them, it weighs the seeded row counts and the statuses' low selectivity, and must still
// choose the sort index.
describe.each([
  { database: "an empty database", seeded: false },
  { database: `a database with ${DOCUMENTS} documents per list and ANALYZE statistics`, seeded: true },
])("the paged lists' date and status sorts on $database", ({ seeded }) => {
  const queries: { sql: string; params: readonly unknown[] }[] = [];
  let orm: Orm;
  beforeAll(async () => {
    orm = await initOrm({ databasePath: path.join(mkdtempSync(path.join(tmpdir(), "cpg-list-sort-plans-")), "cpg.sqlite") }, {
      onQuery: (sql, params) => (queries.push({ sql, params }), sql),
    });
    await orm.migrator.up();
    if (seeded) for (const statement of [...SEED, "analyze"]) await orm.em.getConnection().execute(statement);
  });
  afterAll(async () => {
    await orm.close();
  });

  it.each(CASES)("reads a $table page sorted by $sort $dir from its index, without a temporary sort", async ({ table, list, page: pageSize, sort, column, dir }) => {
    const em = orm.em.fork();
    selectTenant(em, "prod");
    queries.length = 0;
    const page = (await list(em, sort, dir)) as { id: string }[];
    expect(page).toHaveLength(seeded ? pageSize : 0);
    const pageQuery = queries.find(({ sql }) => sql.includes(` from \`${table}\` as `) && sql.includes(" limit "));
    expect(pageQuery).toBeDefined();
    const plan = (await orm.em.getConnection().execute<{ detail: string }[]>(`explain query plan ${pageQuery!.sql}`, [...pageQuery!.params])).map(
      ({ detail }) => detail,
    );
    const index = `${table}_tenant_code_${column}${dir === "desc" ? "_desc" : ""}_code_index`;
    // `tenant_code=?` shows the tenant filter reached the sorted table itself.
    expect(plan).toContainEqual(expect.stringMatching(new RegExp(`^SEARCH \\w+ USING INDEX ${index} \\(tenant_code=\\?\\)$`)));
    expect(plan.filter((detail) => detail.includes("TEMP B-TREE"))).toEqual([]);
  });
});
