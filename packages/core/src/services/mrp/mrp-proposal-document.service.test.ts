import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";

const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };

let orm: Orm;
let container: AppContainer;

beforeEach(async () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-proposal-document-")) });
  await migrateDatabase(config);
  orm = await initOrm(toDbOptions(config));
  container = createAppContainer(config, orm);
});
afterEach(async () => {
  await orm.close();
});

describe("MrpProposalDocumentService.create", () => {
  it("refuses a Make proposal with no BOM to pin, as an internal error no caller should reach, and creates nothing (#320)", async () => {
    const { cradle } = await scopeForTenant(container, "prod");
    const proposal = {
      id: "6f1c0000-0000-4000-8000-000000000000", kind: "production-order" as const, material: "00000001", location: "00000001",
      needDate: "2026-10-05", quantity: "1.000000", bom: null, bomRevision: null,
    };

    await expect(inRequestTransaction(cradle.em, () => cradle.mrpProposalDocumentService.create("00000001", proposal, ANNA))).rejects.toThrow(
      "MRP can't create a production-order proposal's document.",
    );
    expect(await orm.em.getConnection().execute("select count(*) as n from production_order")).toEqual([{ n: 0 }]);
  });
});
