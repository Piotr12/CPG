import type { z } from "zod";
import { auditListSchema } from "@cpg/core/validators/audit/audit-list.schema";
import { bomCreateBodySchema } from "@cpg/core/validators/boms/bom-create.schema";
import { bomApiQuerySchema } from "@cpg/core/validators/boms/bom-list.schema";
import { bomUpdateBodySchema } from "@cpg/core/validators/boms/bom-update.schema";
import { customerOrderApiQuerySchema } from "@cpg/core/validators/customer-orders/customer-order-list.schema";
import { customerOrderCreateSchema, customerOrderUpdateSchema } from "@cpg/core/validators/customer-orders/customer-order.schema";
import {
  customerOrderLifecycleSchema,
  documentLifecycleSchema,
  purchaseOrderLifecycleSchema,
} from "@cpg/core/validators/document-lifecycle/lifecycle.schema";
import { forecastApiQuerySchema } from "@cpg/core/validators/forecasts/forecast-list.schema";
import { forecastChangeBodySchema, forecastCreateSchema, forecastRemoveBodySchema } from "@cpg/core/validators/forecasts/forecast.schema";
import { issueCreateSchema, issueListQuerySchema } from "@cpg/core/validators/goods-issues/goods-issue.schema";
import { receiptCreateSchema, receiptListQuerySchema } from "@cpg/core/validators/goods-receipts/goods-receipt.schema";
import {
  importCommitSchema,
  importDryRunSchema,
  stockImportCommitSchema,
  stockImportDryRunSchema,
} from "@cpg/core/validators/imports/import-request.schema";
import { conversionChangeBodySchema, conversionCreateSchema, conversionRemoveBodySchema } from "@cpg/core/validators/materials/conversion.schema";
import { materialCreateSchema } from "@cpg/core/validators/materials/material-create.schema";
import { materialApiQuerySchema } from "@cpg/core/validators/materials/material-list.schema";
import { materialUpdateBodySchema } from "@cpg/core/validators/materials/material-update.schema";
import { mrpLatestQuerySchema } from "@cpg/core/validators/mrp/mrp-latest.schema";
import { mrpProposalAcceptSchema } from "@cpg/core/validators/mrp/mrp-proposal-accept.schema";
import { mrpRunSchema } from "@cpg/core/validators/mrp/mrp-run.schema";
import { namedRecordCreateSchema } from "@cpg/core/validators/named-records/named-record-create.schema";
import { namedRecordApiQuerySchema } from "@cpg/core/validators/named-records/named-record-list.schema";
import { namedRecordUpdateBodySchema } from "@cpg/core/validators/named-records/named-record-update.schema";
import {
  planningParameterChangeBodySchema,
  planningParameterRemoveBodySchema,
} from "@cpg/core/validators/planning-parameters/planning-parameter-change.schema";
import { planningParameterCreateSchema } from "@cpg/core/validators/planning-parameters/planning-parameter-create.schema";
import { planningParameterApiQuerySchema } from "@cpg/core/validators/planning-parameters/planning-parameter-list.schema";
import { userPreferenceUpdateSchema } from "@cpg/core/validators/preferences/user-preference-update.schema";
import {
  productionCompletionCreateSchema,
  productionCompletionListSchema,
  productionCompletionPreviewSchema,
} from "@cpg/core/validators/production-orders/production-completion.schema";
import { productionOrderApiQuerySchema } from "@cpg/core/validators/production-orders/production-order-list.schema";
import {
  productionOrderCreateSchema,
  productionOrderOptionsSchema,
  productionOrderUpdateSchema,
} from "@cpg/core/validators/production-orders/production-order.schema";
import { purchaseOrderApiQuerySchema } from "@cpg/core/validators/purchasing/purchase-order-list.schema";
import { orderCreateSchema, orderUpdateBodySchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { requisitionApiQuerySchema } from "@cpg/core/validators/purchasing/purchase-requisition-list.schema";
import { requisitionCreateSchema, requisitionUpdateBodySchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { demandReviewQuerySchema } from "@cpg/core/validators/reports/demand-review.schema";
import { stockReportQuerySchema } from "@cpg/core/validators/reports/stock-report.schema";
import { varianceReportQuerySchema } from "@cpg/core/validators/reports/variance-report.schema";
import { safetyStockApiQuerySchema } from "@cpg/core/validators/safety-stock/safety-stock-list.schema";
import {
  safetyStockTargetChangeBodySchema,
  safetyStockTargetCreateSchema,
  safetyStockTargetRemoveBodySchema,
} from "@cpg/core/validators/safety-stock/safety-stock-target.schema";
import { shipmentCreateSchema, shipmentListQuerySchema, shipmentUpdateSchema } from "@cpg/core/validators/shipments/shipment.schema";
import { stockCorrectionSchema, stockLedgerQuerySchema } from "@cpg/core/validators/stock/stock-correction.schema";
import { stockReversalSchema } from "@cpg/core/validators/stock/stock-reversal.schema";
import { tenantReadOnlyBodySchema } from "@cpg/core/validators/tenants/tenant-read-only.schema";
import { testResetBodySchema } from "@cpg/core/validators/tenants/test-reset.schema";
import { transferApiQuerySchema } from "@cpg/core/validators/transfers/transfer-list.schema";
import {
  transferCreateSchema,
  transferPostingSchema,
  transferUpdateBodySchema,
  transferWriteOffSchema,
} from "@cpg/core/validators/transfers/transfer.schema";
import { createUserSchema } from "@cpg/core/validators/users/create-user.schema";
import { resetPasswordBodySchema } from "@cpg/core/validators/users/reset-password.schema";
import { setUserActiveBodySchema } from "@cpg/core/validators/users/set-user-active.schema";

export const API_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
export type ApiMethod = (typeof API_METHODS)[number];

/** Who may call an operation: `admin` when the route checks `assertAdmin`, `any` signed-in account otherwise. */
export type OperationRole = "any" | "admin";

/**
 * The write contract an operation's route wrapper enforces: `tenant` is `tenantApiWrite` (an
 * `Idempotency-Key` plus `Dataset-Generation`, required for Test; the Test reset's wrapper too), `global`
 * is `apiWrite` (the key only), and `null` is a read, which takes neither.
 */
export type OperationWrite = "tenant" | "global" | null;

/** One API route handler, described for clients that can't read the code, such as the MCP server. */
export interface ApiOperation {
  /** `concept.action`, unique; the MCP server maps tools to these ids. */
  id: string;
  method: ApiMethod;
  /** The route's path, with each dynamic segment as `{name}`, named as in the route's folder. */
  path: string;
  role: OperationRole;
  write: OperationWrite;
  /** The schema the route, or the service it calls, parses the JSON body with. */
  body?: z.ZodType;
  /** The schema the route, or the service it calls, parses the query string with. */
  query?: z.ZodType;
  /** One sentence: what the operation does, and the rule a caller most needs. */
  summary: string;
}

const T = "/api/tenants/{tenant}";

const read = (id: string, path: string, summary: string, extra: Partial<ApiOperation> = {}): ApiOperation => ({
  id,
  method: "GET",
  path,
  role: "any",
  write: null,
  summary,
  ...extra,
});

const tenantWrite = (id: string, method: ApiMethod, path: string, summary: string, extra: Partial<ApiOperation> = {}): ApiOperation => ({
  id,
  method,
  path,
  role: "any",
  write: "tenant",
  summary,
  ...extra,
});

const adminTenantWrite = (id: string, method: ApiMethod, path: string, summary: string, extra: Partial<ApiOperation> = {}) =>
  tenantWrite(id, method, path, summary, { role: "admin", ...extra });

const globalWrite = (id: string, method: ApiMethod, path: string, summary: string, extra: Partial<ApiOperation> = {}): ApiOperation => ({
  id,
  method,
  path,
  role: "any",
  write: "global",
  summary,
  ...extra,
});

/** The master data kinds whose list, create, get and update routes share one shape (spec 2026-10-19--2014UTC). */
const namedRecords = (concept: "locations" | "customers" | "suppliers", label: string): ApiOperation[] => [
  read(`${concept}.list`, `${T}/${concept}`, `Lists the tenant's ${label}, inactive ones included, narrowed by q and sorted by sort/dir.`, {
    query: namedRecordApiQuerySchema,
  }),
  adminTenantWrite(`${concept}.create`, "POST", `${T}/${concept}`, `Creates a ${label.replace(/s$/, "")} with the tenant's next eight-digit ID.`, {
    body: namedRecordCreateSchema,
  }),
  read(`${concept}.get`, `${T}/${concept}/{id}`, `One ${label.replace(/s$/, "")} by its eight-digit ID.`),
  adminTenantWrite(`${concept}.update`, "PATCH", `${T}/${concept}/{id}`, `Renames or (de)activates a ${label.replace(/s$/, "")} at the version read.`, {
    body: namedRecordUpdateBodySchema,
  }),
];

/**
 * Every API route handler (R07: the API can do what the screens do), the input of `mcp/cpg_mcp/catalogue.json`
 * (spec `2026-11-22--0818UTC-local-mcp-server`). `tests/api-catalogue.test.ts` fails when a route has no entry,
 * an entry no route, or an entry's role, write contract or schemas disagree with its route. Known limit: it proves
 * a named schema is on the request's path, not that it is the only parse; a route that parses a second schema
 * inline still passes, and code review covers that.
 */
export const API_OPERATIONS: readonly ApiOperation[] = [
  // The caller and their account
  read("me.get", "/api/me", "The caller's own account: id, username, role, and the token's id and name (null for a session)."),
  read("preferences.get", "/api/preferences", "The caller's own language and theme, or the defaults."),
  globalWrite("preferences.update", "PATCH", "/api/preferences", "Changes the caller's own language and/or theme; only the fields sent change.", {
    body: userPreferenceUpdateSchema,
  }),
  read("tokens.list", "/api/tokens", "The caller's own API tokens, newest first: id, name, created, last used. Never a secret."),
  globalWrite("tokens.revoke", "DELETE", "/api/tokens/{id}", "Revokes one of the caller's own tokens. Tokens are created only on /admin/tokens (R07)."),
  read("users.list", "/api/users", "Every account, with its role, active flag and version.", { role: "admin" }),
  globalWrite("users.create", "POST", "/api/users", "Creates a normal user account with a username and password.", { role: "admin", body: createUserSchema }),
  globalWrite("users.set-active", "PATCH", "/api/users/{id}", "Activates or deactivates an account at the version read; deactivating ends its sessions and tokens.", {
    role: "admin",
    body: setUserActiveBodySchema,
  }),
  globalWrite("users.reset-password", "PUT", "/api/users/{id}/password", "Sets a new password at the version read; ends the account's sessions and tokens.", {
    role: "admin",
    body: resetPasswordBodySchema,
  }),
  read("audit.global", "/api/audit", "The Global audit, newest first, keyset-paged by before, filtered by subject, account, channel and dates.", {
    query: auditListSchema,
  }),
  read("import.template", "/api/import/template", "The master-data import template, an .xlsx download for a human."),
  read("stock-import.template", "/api/stock-import/template", "The stock import template, an .xlsx download for a human."),

  // Tenants
  read("tenants.list", "/api/tenants", "Both tenants: code, name, current dataset generation and read-only flag."),
  read("tenants.get", T, "One tenant's code, name, current dataset generation and read-only flag."),
  globalWrite("tenants.set-read-only", "PATCH", T, "Makes a tenant read-only or writable again (R05). A global write: no Dataset-Generation.", {
    role: "admin",
    body: tenantReadOnlyBodySchema,
  }),
  tenantWrite("tenants.test-reset", "POST", "/api/tenants/test/reset", "Replaces Test's business data with a demonstration dataset and bumps its generation.", {
    role: "admin",
    body: testResetBodySchema,
  }),
  read("audit.tenant", `${T}/audit`, "The tenant's audit, newest first, keyset-paged by before, filtered by subject, account, channel and dates.", {
    query: auditListSchema,
  }),

  // Master data
  read("materials.list", `${T}/materials`, "Lists the tenant's materials, narrowed by q and sorted by sort/dir.", { query: materialApiQuerySchema }),
  adminTenantWrite("materials.create", "POST", `${T}/materials`, "Creates a material (type, description, base unit) with the tenant's next eight-digit ID.", {
    body: materialCreateSchema,
  }),
  read("materials.get", `${T}/materials/{id}`, "One material and its unit conversions."),
  adminTenantWrite("materials.update", "PATCH", `${T}/materials/{id}`, "Edits a material's description, type, base unit or active flag at the version read.", {
    body: materialUpdateBodySchema,
  }),
  adminTenantWrite("material-conversions.create", "POST", `${T}/materials/{id}/conversions`, "Adds a unit conversion: numerator/denominator base units per unit.", {
    body: conversionCreateSchema,
  }),
  adminTenantWrite("material-conversions.update", "PATCH", `${T}/materials/{id}/conversions/{unit}`, "Changes a unit conversion's factor at the version read.", {
    body: conversionChangeBodySchema,
  }),
  adminTenantWrite("material-conversions.remove", "DELETE", `${T}/materials/{id}/conversions/{unit}`, "Removes a unit conversion at the version read.", {
    body: conversionRemoveBodySchema,
  }),
  ...namedRecords("locations", "locations"),
  ...namedRecords("customers", "customers"),
  ...namedRecords("suppliers", "suppliers"),
  read("planning-parameters.list", `${T}/planning-parameters`, "Lists the planning parameters per material and location: procurement, lead time, lot rules.", {
    query: planningParameterApiQuerySchema,
  }),
  adminTenantWrite("planning-parameters.create", "POST", `${T}/planning-parameters`, "Sets how a material is procured at a location: Buy or Make, lead time, minimum and multiple.", {
    body: planningParameterCreateSchema,
  }),
  adminTenantWrite("planning-parameters.update", "PATCH", `${T}/planning-parameters/{material}/{location}`, "Edits a material's planning parameters at a location, at the version read.", {
    body: planningParameterChangeBodySchema,
  }),
  adminTenantWrite("planning-parameters.remove", "DELETE", `${T}/planning-parameters/{material}/{location}`, "Removes a material's planning parameters at a location, at the version read.", {
    body: planningParameterRemoveBodySchema,
  }),
  read("safety-stock-targets.list", `${T}/safety-stock-targets`, "Lists the safety-stock targets per material, location and effective date.", {
    query: safetyStockApiQuerySchema,
  }),
  adminTenantWrite("safety-stock-targets.create", "POST", `${T}/safety-stock-targets`, "Sets a safety-stock target for a material at a location from an effective date.", {
    body: safetyStockTargetCreateSchema,
  }),
  adminTenantWrite(
    "safety-stock-targets.update",
    "PATCH",
    `${T}/safety-stock-targets/{material}/{location}/{effectiveFrom}`,
    "Changes a safety-stock target's quantity at the version read.",
    { body: safetyStockTargetChangeBodySchema },
  ),
  adminTenantWrite(
    "safety-stock-targets.remove",
    "DELETE",
    `${T}/safety-stock-targets/{material}/{location}/{effectiveFrom}`,
    "Removes a safety-stock target at the version read.",
    { body: safetyStockTargetRemoveBodySchema },
  ),
  read("boms.list", `${T}/boms`, "Lists the tenant's BOMs, narrowed by q and sorted by sort/dir.", { query: bomApiQuerySchema }),
  adminTenantWrite("boms.create", "POST", `${T}/boms`, "Creates a BOM: an output, its priority, validity dates and components.", { body: bomCreateBodySchema }),
  read("boms.get", `${T}/boms/{id}`, "One BOM at its current revision."),
  adminTenantWrite("boms.update", "PATCH", `${T}/boms/{id}`, "Revises a BOM (priority, validity, components, active) at the version read; the output never changes.", {
    body: bomUpdateBodySchema,
  }),
  read("boms.revision", `${T}/boms/{id}/revisions/{revision}`, "One earlier revision of a BOM, by its number from 1."),

  // Demand
  read("forecasts.list", `${T}/forecasts`, "Lists the forecasts, narrowed to a material and/or location, a page of 100 at a time.", {
    query: forecastApiQuerySchema,
  }),
  adminTenantWrite("forecasts.create", "POST", `${T}/forecasts`, "Adds a forecast quantity for a material at a location on a date.", { body: forecastCreateSchema }),
  adminTenantWrite("forecasts.update", "PATCH", `${T}/forecasts/{material}/{location}/{date}`, "Changes a forecast's quantity and unit at the version read.", {
    body: forecastChangeBodySchema,
  }),
  adminTenantWrite("forecasts.remove", "DELETE", `${T}/forecasts/{material}/{location}/{date}`, "Removes a forecast at the version read.", {
    body: forecastRemoveBodySchema,
  }),
  read("customer-orders.list", `${T}/customer-orders`, "Lists the customer orders, narrowed by q and sorted by sort/dir.", { query: customerOrderApiQuerySchema }),
  tenantWrite("customer-orders.create", "POST", `${T}/customer-orders`, "Enters a customer order: a customer, a location and lines of material, quantity, unit and required date.", {
    body: customerOrderCreateSchema,
  }),
  read("customer-orders.get", `${T}/customer-orders/{id}`, "One customer order with its lines, outstanding quantities and shipments."),
  tenantWrite("customer-orders.update", "PATCH", `${T}/customer-orders/{id}`, "Edits an Open customer order's header or lines at the version read.", {
    body: customerOrderUpdateSchema,
  }),
  tenantWrite("customer-orders.cancel", "POST", `${T}/customer-orders/{id}/cancel`, "Cancels an unprocessed customer order, or the listed lines, at the version read.", {
    body: customerOrderLifecycleSchema,
  }),
  tenantWrite("customer-orders.close-early", "POST", `${T}/customer-orders/{id}/close-early`, "Abandons the order's open remainder, or the listed lines', at the version read.", {
    body: customerOrderLifecycleSchema,
  }),
  read("shipments.list", `${T}/shipments`, "Lists the shipments, narrowed to a customer order, a page at a time.", { query: shipmentListQuerySchema }),
  tenantWrite("shipments.create", "POST", `${T}/shipments`, "Plans a shipment of a customer order's lines on a date.", { body: shipmentCreateSchema }),
  read("shipments.get", `${T}/shipments/{id}`, "One shipment with its lines and goods issues."),
  tenantWrite("shipments.update", "PATCH", `${T}/shipments/{id}`, "Edits a planned shipment at the version read.", { body: shipmentUpdateSchema }),
  tenantWrite("shipments.cancel", "POST", `${T}/shipments/{id}/cancel`, "Cancels a shipment nothing was issued against, at the version read.", { body: documentLifecycleSchema }),
  read("goods-issues.list", `${T}/goods-issues`, "Lists the goods issues, narrowed to a shipment, a page at a time.", { query: issueListQuerySchema }),
  tenantWrite("goods-issues.create", "POST", `${T}/goods-issues`, "Posts a goods issue against a shipment: stock leaves and the order lines are fulfilled. No negative stock (R09).", {
    body: issueCreateSchema,
  }),
  read("goods-issues.get", `${T}/goods-issues/{id}`, "One goods issue with its lines and movements."),

  // Supply
  read("purchase-requisitions.list", `${T}/purchase-requisitions`, "Lists the purchase requisitions, narrowed by q and sorted by sort/dir.", {
    query: requisitionApiQuerySchema,
  }),
  tenantWrite("purchase-requisitions.create", "POST", `${T}/purchase-requisitions`, "Raises a purchase requisition for a material at a location by a required date.", {
    body: requisitionCreateSchema,
  }),
  read("purchase-requisitions.get", `${T}/purchase-requisitions/{id}`, "One purchase requisition."),
  tenantWrite("purchase-requisitions.update", "PATCH", `${T}/purchase-requisitions/{id}`, "Changes a requisition's required date at the version read; nothing else changes.", {
    body: requisitionUpdateBodySchema,
  }),
  tenantWrite("purchase-requisitions.cancel", "POST", `${T}/purchase-requisitions/{id}/cancel`, "Cancels an Open requisition at the version read.", { body: documentLifecycleSchema }),
  tenantWrite("purchase-requisitions.close-early", "POST", `${T}/purchase-requisitions/{id}/close-early`, "Closes a requisition early at the version read.", {
    body: documentLifecycleSchema,
  }),
  read("purchase-orders.list", `${T}/purchase-orders`, "Lists the purchase orders, narrowed by q and sorted by sort/dir.", { query: purchaseOrderApiQuerySchema }),
  tenantWrite("purchase-orders.create", "POST", `${T}/purchase-orders`, "Places a purchase order with a supplier for a location; a line may convert an Open requisition.", {
    body: orderCreateSchema,
  }),
  read("purchase-orders.get", `${T}/purchase-orders/{id}`, "One purchase order with its lines, received quantities and receipts."),
  tenantWrite("purchase-orders.update", "PATCH", `${T}/purchase-orders/{id}`, "Changes lines' planned dates at the version read; quantities, materials and the supplier never change.", {
    body: orderUpdateBodySchema,
  }),
  tenantWrite("purchase-orders.cancel", "POST", `${T}/purchase-orders/{id}/cancel`, "Cancels an unreceived purchase order, or the listed lines, at the version read.", {
    body: purchaseOrderLifecycleSchema,
  }),
  tenantWrite("purchase-orders.close-early", "POST", `${T}/purchase-orders/{id}/close-early`, "Abandons the order's unreceived remainder, or the listed lines', at the version read.", {
    body: purchaseOrderLifecycleSchema,
  }),
  read("goods-receipts.list", `${T}/goods-receipts`, "Lists the goods receipts, narrowed to a purchase order, a page at a time.", { query: receiptListQuerySchema }),
  tenantWrite("goods-receipts.create", "POST", `${T}/goods-receipts`, "Posts a goods receipt against a purchase order: stock arrives and the lines are received.", {
    body: receiptCreateSchema,
  }),
  read("goods-receipts.get", `${T}/goods-receipts/{id}`, "One goods receipt with its lines and movements."),
  read("production-orders.list", `${T}/production-orders`, "Lists the production orders, narrowed by q and sorted by sort/dir.", {
    query: productionOrderApiQuerySchema,
  }),
  tenantWrite("production-orders.create", "POST", `${T}/production-orders`, "Creates a production order for a Make output at a location, pinned to a BOM revision.", {
    body: productionOrderCreateSchema,
  }),
  read("production-orders.options", `${T}/production-orders/options`, "The BOMs valid for an output at a location on a date, with their component shortages.", {
    query: productionOrderOptionsSchema,
  }),
  read("production-orders.get", `${T}/production-orders/{id}`, "One production order with its pinned BOM, outstanding components and shortages."),
  tenantWrite("production-orders.update", "PATCH", `${T}/production-orders/{id}`, "Changes an Open order's target quantity or planned finish at the version read.", {
    body: productionOrderUpdateSchema,
  }),
  tenantWrite("production-orders.cancel", "POST", `${T}/production-orders/{id}/cancel`, "Cancels an unprocessed production order at the version read.", { body: documentLifecycleSchema }),
  tenantWrite("production-orders.close-early", "POST", `${T}/production-orders/{id}/close-early`, "Abandons a production order's remainder at the version read.", {
    body: documentLifecycleSchema,
  }),
  read("production-completions.list", `${T}/production-orders/{id}/completions`, "The completions posted against a production order, a page at a time.", {
    query: productionCompletionListSchema,
  }),
  tenantWrite("production-completions.create", "POST", `${T}/production-orders/{id}/completions`, "Posts output and the materials actually used, in one posting dated today. No negative stock (R09).", {
    body: productionCompletionCreateSchema,
  }),
  read("production-completions.preview", `${T}/production-orders/{id}/completions/preview`, "What a completion of the given output would consume by the pinned BOM, without posting.", {
    query: productionCompletionPreviewSchema,
  }),
  tenantWrite(
    "production-completions.reverse",
    "POST",
    `${T}/production-orders/{id}/completions/{completionId}/reverse`,
    "Reverses a whole completion today, with a reason: the output leaves and the materials return.",
    { body: stockReversalSchema },
  ),
  read("transfers.list", `${T}/transfers`, "Lists the transfers between locations, narrowed by q and sorted by sort/dir.", { query: transferApiQuerySchema }),
  tenantWrite("transfers.create", "POST", `${T}/transfers`, "Plans a transfer of a material from one location to another.", { body: transferCreateSchema }),
  read("transfers.get", `${T}/transfers/{id}`, "One transfer with its dispatched, received and written-off quantities and postings."),
  tenantWrite("transfers.update", "PATCH", `${T}/transfers/{id}`, "Changes a transfer's planned dispatch and arrival dates at the version read.", { body: transferUpdateBodySchema }),
  tenantWrite("transfers.cancel", "POST", `${T}/transfers/{id}/cancel`, "Cancels an undispatched transfer at the version read.", { body: documentLifecycleSchema }),
  tenantWrite("transfers.close-early", "POST", `${T}/transfers/{id}/close-early`, "Abandons a transfer's remainder at the version read.", { body: documentLifecycleSchema }),
  tenantWrite("transfers.dispatch", "POST", `${T}/transfers/{id}/dispatches`, "Dispatches a quantity: stock leaves the origin and is in transit. No negative stock (R09).", {
    body: transferPostingSchema,
  }),
  tenantWrite("transfers.receive", "POST", `${T}/transfers/{id}/receipts`, "Receives a quantity in transit at the destination.", { body: transferPostingSchema }),
  tenantWrite("transfers.write-off", "POST", `${T}/transfers/{id}/write-offs`, "Writes off a quantity lost in transit.", { body: transferWriteOffSchema }),
  tenantWrite("transfer-postings.reverse", "POST", `${T}/transfers/{id}/postings/{postingId}/reverse`, "Reverses a transfer posting today, with a reason.", {
    body: stockReversalSchema,
  }),

  // Stock
  read("stock.get", `${T}/stock`, "A material's stock at a location: the balance and its movements, a page at a time.", { query: stockLedgerQuerySchema }),
  tenantWrite("stock.correct", "POST", `${T}/stock/corrections`, "Corrects a material's stock at a location by a nonzero signed change (never a target balance), with a reason.", {
    body: stockCorrectionSchema,
  }),
  read("stock-movements.get", `${T}/stock/movements/{id}`, "One stock movement."),
  tenantWrite("stock-movements.reverse", "POST", `${T}/stock/movements/{id}/reverse`, "Reverses a whole stock movement today, with a reason.", { body: stockReversalSchema }),
  tenantWrite("stock-import.dry-run", "POST", `${T}/stock-import/dry-run`, "Checks a base64 stock workbook and answers what it would post, with a preview token. Posts nothing.", {
    body: stockImportDryRunSchema,
  }),
  tenantWrite("stock-import.commit", "POST", `${T}/stock-import/commit`, "Posts a stock workbook checked by a dry run, by its preview token and a reason.", {
    body: stockImportCommitSchema,
  }),
  adminTenantWrite("import.dry-run", "POST", `${T}/import/dry-run`, "Checks a base64 master-data workbook and answers what it would change, with a preview token.", {
    body: importDryRunSchema,
  }),
  adminTenantWrite("import.commit", "POST", `${T}/import/commit`, "Applies a master-data workbook checked by a dry run, by its preview token.", { body: importCommitSchema }),

  // Reports and MRP
  read("reports.stock", `${T}/reports/stock`, "The current stock per material and location, a page at a time.", { query: stockReportQuerySchema }),
  read("reports.variance", `${T}/reports/variance`, "Production variance per order: expected against actual material use.", { query: varianceReportQuerySchema }),
  read("reports.demand-review", `${T}/reports/demand-review`, "Demand against forecast by day, week or month, for finished products.", { query: demandReviewQuerySchema }),
  read("mrp.runs.latest", `${T}/mrp/runs/latest`, "The latest MRP run and a page of its report: projected balances, proposals, exceptions.", {
    query: mrpLatestQuerySchema,
  }),
  tenantWrite("mrp.runs.create", "POST", `${T}/mrp/runs`, "Runs MRP: manual proposes only; automatic also creates the documents. It never edits existing documents (R10).", {
    body: mrpRunSchema,
  }),
  tenantWrite("mrp.proposals.accept", "POST", `${T}/mrp/runs/{run}/proposals/{proposal}/accept`, "Accepts one proposal of the latest run, creating the document it proposes; no existing document changes.", {
    body: mrpProposalAcceptSchema,
  }),
];
