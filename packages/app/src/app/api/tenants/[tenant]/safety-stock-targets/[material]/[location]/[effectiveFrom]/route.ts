import { apiActor, assertAdmin, parseInput } from "@cpg/core";
import {
  safetyStockTargetChangeBodySchema,
  safetyStockTargetRemoveBodySchema,
} from "@cpg/core/validators/safety-stock/safety-stock-target.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/safety-stock-targets/[material]/[location]/[effectiveFrom]">;

/** Sets a target's quantity at the version the client loaded (409 `VERSION_CONFLICT`, API-029). Admin only. */
export const PATCH = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const key = await context.params;
    const { quantity, version } = parseInput(safetyStockTargetChangeBodySchema, body);
    return cradle.safetyStockTargetService.update(keyOf(key), quantity, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);

/** Removes the target at the version the client loaded, sent as `{ "version": n }`. Admin only. */
export const DELETE = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const key = await context.params;
    const { version } = parseInput(safetyStockTargetRemoveBodySchema, body);
    return cradle.safetyStockTargetService.remove(keyOf(key), version, apiActor(caller));
  },
  { authorize: assertAdmin },
);

/** The target's key from the path, without the tenant. */
function keyOf({ material, location, effectiveFrom }: { material: string; location: string; effectiveFrom: string }) {
  return { material, location, effectiveFrom };
}
