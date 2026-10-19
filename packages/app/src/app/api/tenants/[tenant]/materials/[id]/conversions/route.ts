import { apiActor, assertAdmin, parseInput } from "@cpg/core";
import { conversionCreateSchema } from "@cpg/core/validators/materials/conversion.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../../../auth/api-write";

type Context = RouteContext<"/api/tenants/[tenant]/materials/[id]/conversions">;

/**
 * Adds a conversion, `1 unit = numerator / denominator` base units, both decimal strings (spec Q3).
 * The conversions themselves are read with their material. Admin only.
 */
export const POST = tenantApiWrite(
  async ({ caller, body, context, cradle }: WriteContext<Context>) =>
    cradle.materialService.addConversion(
      (await context.params).id,
      parseInput(conversionCreateSchema, body),
      apiActor(caller),
    ),
  { authorize: assertAdmin },
);
