import { Material } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scopeForTenant } from "../../container/tenant-scope";
import { AppError } from "../../http/errors";
import { inRequestTransaction } from "../../http/request-transaction";
import { existing, referenced, runRow, type ApplyContext } from "./apply-context";
import { ACTOR, importKit, type ImportKit } from "./import-test-kit";

let kit: ImportKit;

beforeEach(async () => {
  kit = await importKit();
  await kit.write(({ materialService }) => materialService.create({ type: "raw", description: "Steel sheet", baseUnit: "kg" }, ACTOR));
});
afterEach(() => kit.orm.close());

async function context(): Promise<ApplyContext> {
  const { cradle } = await scopeForTenant(kit.container, "prod");
  return { em: cradle.em, services: cradle, actor: ACTOR, tenantName: "Prod", errors: [], outcomes: [], versions: [] };
}

describe("runRow", () => {
  it("leaves nothing dirty after a refused row, so a later flush can't write it (spec Q6)", async () => {
    const ctx = await context();
    await inRequestTransaction(ctx.em, async () => {
      await runRow(ctx, "materials", 2, async () => {
        // A service that loaded and changed a record, then refused.
        (await ctx.em.findOneOrFail(Material, { code: "00000001" })).description = "half-changed";
        throw new AppError("REFUSED", "Refused.");
      });
      await ctx.em.flush();
    });

    expect(ctx.errors).toEqual([{ sheet: "Materials", row: 2, column: null, code: "REFUSED", message: "Refused." }]);
    expect((await kit.write(({ materialService }) => materialService.get("00000001"))).description).toBe("Steel sheet");
  });
});

describe("existing and referenced", () => {
  it("let any other failure through unchanged", async () => {
    const ctx = await context();
    const other = new AppError("OTHER", "Other.");
    const broken = new Error("broken");
    for (const lookup of [
      (error: Error) => existing(ctx, () => Promise.reject(error), "MATERIAL_NOT_FOUND", "material", "00000009"),
      (error: Error) => referenced(ctx, () => Promise.reject(error), "MATERIAL_NOT_FOUND", "material", "00000009", "Material ID"),
    ]) {
      await expect(lookup(other)).rejects.toBe(other);
      await expect(lookup(broken)).rejects.toBe(broken);
    }
  });
});
