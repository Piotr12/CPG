import Link from "next/link";
import { BUSINESS_ID_PATTERN } from "@cpg/core/validators/business-ids/business-id.schema";
import { errorFormatter } from "../forms/form-labels";

/** Master deactivation refusals link directly to their unfinished production document. */
export function productionBlockerError(labels: { errors: Record<string, string> }, tenant: string) {
  const format = errorFormatter(labels);
  return function formatProductionError(error: { code: string; message: string; params?: Record<string, string> }) {
    const order = error.params?.order;
    const linked = error.code === "MATERIAL_HAS_PRODUCTION_ORDERS" || error.code === "LOCATION_HAS_PRODUCTION_ORDERS";
    const text = format(error);
    return linked && order && BUSINESS_ID_PATTERN.test(order)
      ? <>{text} <Link className="underline" href={`/admin/${tenant}/production-orders/${order}`}>{order}</Link></>
      : text;
  };
}
