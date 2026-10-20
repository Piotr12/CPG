import { apiActor, assertAdmin, parseInput } from "@cpg/core";
import {
  planningParameterChangeBodySchema,
  planningParameterRemoveBodySchema,
} from "@cpg/core/validators/planning-parameters/planning-parameter-change.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/planning-parameters/[material]/[location]">;

/**
 * Changes any of Make/Buy, lead time, minimum lot and lot multiple at the version the client loaded
 * (409 `VERSION_CONFLICT`, API-029). Make stays refused for a raw material (MAT-014). Admin only.
 */
export const PATCH = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const { material, location } = await context.params;
    const { version, ...changes } = parseInput(planningParameterChangeBodySchema, body);
    return cradle.planningParameterService.update(material, location, changes, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);

/** Removes the set at the version the client loaded, sent as `{ "version": n }`. Admin only. */
export const DELETE = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const { material, location } = await context.params;
    const { version } = parseInput(planningParameterRemoveBodySchema, body);
    return cradle.planningParameterService.remove(material, location, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);
