import type { EntityManager } from "@cpg/db";
import type { ImportIssue } from "../../domain/imports/prepare-import";
import { columnHeader, sheetSpec, type SheetKey } from "../../domain/imports/workbook-layout";
import { AppError, ValidationError } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import type { BomService } from "../boms/bom.service";
import type { CustomerService } from "../customers/customer.service";
import type { LocationService } from "../locations/location.service";
import type { MaterialService } from "../materials/material.service";
import type { PlanningParameterService } from "../planning-parameters/planning-parameter.service";
import type { SafetyStockTargetService } from "../safety-stock/safety-stock-target.service";
import type { SupplierService } from "../suppliers/supplier.service";

export type ChangeValue = string | number | boolean | null;

/** One value a row changes, by its column name, before and after (null when it had none). */
export interface ImportChange {
  field: string;
  before: ChangeValue;
  after: ChangeValue;
}

/** What one row does, or would do (spec `2026-10-20--0908UTC-master-data-bom-import`, XLS-011). */
export interface ImportRowOutcome {
  sheet: string;
  row: number;
  action: "create" | "update" | "unchanged";
  /** The record's business key: `00000003`, `00000003/case`, `00000003/00000001`, `00000003/00000001/2027-01-01`. */
  record: string;
  /** A new BOM's import reference. */
  reference?: string;
  label: string;
  changes: ImportChange[];
}

/** The services one import writes with: those of the request's tenant scope, sharing its `em`. */
export interface ImportServices {
  materialService: MaterialService;
  locationService: LocationService;
  customerService: CustomerService;
  supplierService: SupplierService;
  planningParameterService: PlanningParameterService;
  safetyStockTargetService: SafetyStockTargetService;
  bomService: BomService;
}

/** What the apply pass accumulates while it runs the rows. */
export interface ApplyContext {
  em: EntityManager;
  services: ImportServices;
  actor: AuditActor;
  /** The tenant's name for messages: "Test". */
  tenantName: string;
  errors: ImportIssue[];
  outcomes: ImportRowOutcome[];
  /** `Kind:key@version` of every record a row names or writes, read before the row applies (Q7). */
  versions: string[];
}

/**
 * A row's own refusal, found before its service call (an unknown ID, a missing reference) or placed
 * on another row (a BOM line). Carries where it belongs, unlike a service's `AppError`.
 */
export class RowIssueError extends AppError {
  constructor(
    code: string,
    message: string,
    readonly column: string | null,
    readonly params?: Record<string, string | number>,
    readonly row?: { sheet: string; row: number },
  ) {
    super(code, message);
  }
}

/** Several row issues at once, such as every BOM line that names a missing material (XLS-009). */
export class RowIssuesError extends AppError {
  constructor(readonly issues: ImportIssue[]) {
    super("IMPORT_ROW_ISSUES", issues.map((issue) => issue.message).join(" "));
  }
}

/** A `RowIssueError` as the issue it reports, on its own row or on `sheet`/`row`. */
export function issueOf(error: RowIssueError, sheet: string, row: number): ImportIssue {
  const issue: ImportIssue = { ...(error.row ?? { sheet, row }), column: error.column, code: error.code, message: error.message };
  return error.params ? { ...issue, params: error.params } : issue;
}

/** Where a service's refusal is shown: a field error by field, any other error by its code. */
export interface ErrorPlacement {
  /** The row and column of a field error, by the service's field key; default: this row, the column of that field. */
  field?: (field: string) => { sheet: string; row: number; column: string | null };
  /** The column of a service error code that names no field. */
  codes?: Record<string, string>;
}

/**
 * Runs one row's service call. An `AppError` becomes the row's error (or errors) and the run goes on:
 * the service already rolled its savepoint back, and the identity map is cleared so nothing the
 * refused call loaded or changed can be flushed later (spec Q6). Anything else is a real failure
 * and ends the whole import.
 */
export async function runRow(
  context: ApplyContext,
  key: SheetKey,
  row: number,
  apply: () => Promise<ImportRowOutcome>,
  placement: ErrorPlacement = {},
): Promise<void> {
  const sheet = sheetSpec(key).name;
  try {
    context.outcomes.push(await apply());
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    context.errors.push(...issuesOf(error, sheet, row, key, placement));
  } finally {
    // Every row starts from an empty identity map. After a refusal, nothing the refused call loaded or
    // changed can be flushed later; after a success, everything is already flushed, and a map grown by
    // every earlier row would make each flush slower: a 2,000-row dry run took 17.9 s instead of 0.4 s.
    context.em.clear();
  }
}

function issuesOf(error: AppError, sheet: string, row: number, key: SheetKey, placement: ErrorPlacement): ImportIssue[] {
  if (error instanceof RowIssueError) return [issueOf(error, sheet, row)];
  if (error instanceof RowIssuesError) return error.issues;
  if (error instanceof ValidationError) {
    const place = placement.field ?? ((field: string) => ({ sheet, row, column: columnHeader(key, field) }));
    return Object.entries(error.fieldErrors).map(([field, [message]]) => ({ ...place(field), code: "VALIDATION_FAILED", message }));
  }
  return [{ sheet, row, column: placement.codes?.[error.code] ?? null, code: error.code, message: error.message, ...(error.messageParams && { params: error.messageParams }) }];
}

/**
 * Loads an existing record by its ID, turning the service's not-found into the import's unknown-ID
 * error on the ID column (XLS-004): "Leave the ID blank to create a new material."
 */
export async function existing<T>(context: ApplyContext, load: () => Promise<T>, notFoundCode: string, noun: string, id: string, column = "ID"): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== notFoundCode) throw error;
    const message = `${capitalized(noun)} ${id} doesn't exist in ${context.tenantName}. Leave the ID blank to create a new ${noun}.`;
    throw new RowIssueError("IMPORT_UNKNOWN_ID", message, column, { id, record: noun });
  }
}

/**
 * Loads a record a row references, turning the service's not-found into the import's dependency
 * error (XLS-007, XLS-008, spec Q4) on the referencing column.
 */
export async function referenced<T>(
  context: ApplyContext,
  load: () => Promise<T>,
  notFoundCode: string,
  noun: string,
  id: string,
  column: string,
  row?: { sheet: string; row: number },
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== notFoundCode) throw error;
    const message = `${capitalized(noun)} ${id} doesn't exist in ${context.tenantName}. Create or import it first: a row can only use records that exist, or that an earlier sheet of this workbook creates.`;
    throw new RowIssueError("IMPORT_MISSING_REFERENCE", message, column, { id, record: noun }, row);
  }
}

const capitalized = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Notes the version of a record a row names or writes, for the preview token. */
export function noteVersion(context: ApplyContext, kind: string, key: string, version: number): void {
  context.versions.push(`${kind}:${key}@${version}`);
}

/** The changes between two views of a record over the given fields, as column name → before/after. */
export function changesBetween<T extends object>(before: T, after: T, fields: readonly (readonly [keyof T & string, string])[]): ImportChange[] {
  return fields.flatMap(([field, column]) => {
    const was = before[field] as ChangeValue;
    const is = after[field] as ChangeValue;
    return was === is ? [] : [{ field: column, before: was, after: is }];
  });
}

/** A new record's values as changes from nothing. */
export function createdValues<T extends object>(record: T, fields: readonly (readonly [keyof T & string, string])[]): ImportChange[] {
  return fields.map(([field, column]) => ({ field: column, before: null, after: record[field] as ChangeValue }));
}
