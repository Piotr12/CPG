import { apiActor, assertAdmin, parseInput } from "@cpg/core";
import {
  conversionChangeBodySchema,
  conversionRemoveBodySchema,
} from "@cpg/core/validators/materials/conversion.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/materials/[id]/conversions/[unit]">;

/** Changes a conversion's factor at the version the client loaded; only new entries use it (MAT-027). Admin only. */
export const PATCH = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const { id, unit } = await context.params;
    const { version, ...factor } = parseInput(conversionChangeBodySchema, body);
    return cradle.materialService.changeConversion(id, unit, factor, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);

/** Removes a conversion at the version the client loaded, sent as `{ "version": n }`. Admin only. */
export const DELETE = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) => {
    const { id, unit } = await context.params;
    const { version } = parseInput(conversionRemoveBodySchema, body);
    return cradle.materialService.removeConversion(id, unit, version, apiActor(caller));
  },
  { authorize: assertAdmin },
);
