import Link from "next/link";
import { BUSINESS_ID_PATTERN } from "@cpg/core/validators/business-ids/business-id.schema";
import { errorFormatter } from "../forms/form-labels";

/** Per refusal code: the parameter naming the unfinished document that blocks it, and the screen that opens it (LFC-018). A requisition has no page of its own, so `LOCATION_HAS_REQUISITIONS` names it without a link. */
const BLOCKERS = new Map([
  ["MATERIAL_HAS_PRODUCTION_ORDERS", { param: "order", route: "production-orders" }],
  ["LOCATION_HAS_PRODUCTION_ORDERS", { param: "order", route: "production-orders" }],
  ["LOCATION_HAS_OPEN_TRANSFERS", { param: "transfer", route: "transfers" }],
  ["MATERIAL_IN_OPEN_TRANSFER", { param: "transfer", route: "transfers" }],
  ["LOCATION_HAS_PURCHASE_ORDERS", { param: "order", route: "purchase-orders" }],
  ["MATERIAL_IN_OPEN_ORDER", { param: "order", route: "purchase-orders" }],
  ["LOCATION_HAS_CUSTOMER_ORDERS", { param: "order", route: "customer-orders" }],
  ["MATERIAL_HAS_CUSTOMER_DEMAND", { param: "order", route: "customer-orders" }],
]);

/** Master deactivation refusals link directly to their unfinished document: a production order, a transfer, a purchase order or a customer order. */
export function deactivationBlockerError(labels: { errors: Record<string, string> }, tenant: string) {
  const format = errorFormatter(labels);
  return function formatDeactivationError(error: { code: string; message: string; params?: Record<string, string> }) {
    const text = format(error);
    const blocker = BLOCKERS.get(error.code);
    const id = blocker && error.params?.[blocker.param];
    return blocker && id && BUSINESS_ID_PATTERN.test(id)
      ? <>{text} <Link className="underline" href={`/admin/${tenant}/${blocker.route}/${id}`}>{id}</Link></>
      : text;
  };
}
