import { z } from "zod";
import { enteredQuantitySchema } from "../boms/bom-fields.schema";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { stockReasonSchema } from "../stock/stock-correction.schema";
import { versionSchema } from "../version.schema";

/** The English messages; screens translate them by matching these constants. */
export const TRANSFER_SAME_LOCATION_MESSAGE = "The destination must be another location than the source.";
export const TRANSFER_ARRIVAL_BEFORE_DISPATCH_MESSAGE = "The planned arrival can't be before the planned dispatch.";
export const TRANSFER_SINGLE_MATERIAL_MESSAGE = "A transfer moves one material: create one transfer per material.";
export const TRANSFER_IMMUTABLE_MESSAGE = "Only the planned dates of a transfer can change.";

/** How many transfers one list page holds, as many as a page of customer orders. */
export const TRANSFER_PAGE_SIZE = 100;

/** Refuses an arrival before the dispatch (TRF-026), on `plannedArrival`. */
function arrivalNotBeforeDispatch({ plannedDispatch, plannedArrival }: { plannedDispatch: string; plannedArrival: string }, ctx: z.RefinementCtx): void {
  if (plannedArrival < plannedDispatch) ctx.addIssue({ code: "custom", path: ["plannedArrival"], message: TRANSFER_ARRIVAL_BEFORE_DISPATCH_MESSAGE });
}

/** What a body may not carry, refused rather than dropped, so a client never believes it was applied. */
const refused = (message: string) => z.never({ error: message }).optional();

/**
 * `POST /api/tenants/{tenant}/transfers`, and the Create transfer form (spec Q2): one material, two
 * different locations, a quantity in any unit the material converts, and the planned dispatch and
 * arrival, arrival not earlier (TRF-001, TRF-002, TRF-026). A body that names `materials` or
 * `lines` is refused: a transfer has one material.
 */
export const transferCreateSchema = z
  .object({
    material: materialReferenceSchema,
    source: locationReferenceSchema,
    destination: locationReferenceSchema,
    quantity: enteredQuantitySchema,
    unit: unitSchema,
    plannedDispatch: calendarDateSchema,
    plannedArrival: calendarDateSchema,
    materials: refused(TRANSFER_SINGLE_MATERIAL_MESSAGE),
    lines: refused(TRANSFER_SINGLE_MATERIAL_MESSAGE),
  })
  .superRefine((transfer, ctx) => {
    if (transfer.destination === transfer.source) ctx.addIssue({ code: "custom", path: ["destination"], message: TRANSFER_SAME_LOCATION_MESSAGE });
    arrivalNotBeforeDispatch(transfer, ctx);
  });

export type TransferCreateInput = z.infer<typeof transferCreateSchema>;

/** The Change dates form: both planned dates, arrival not earlier (spec Q3); the page binds the version. */
export const transferDatesSchema = z
  .object({ plannedDispatch: calendarDateSchema, plannedArrival: calendarDateSchema })
  .superRefine(arrivalNotBeforeDispatch);

export type TransferDates = z.infer<typeof transferDatesSchema>;

/**
 * `PATCH /api/tenants/{tenant}/transfers/{id}` (spec Q3): both planned dates, at the version the client
 * loaded. The material, the locations, the quantity and the unit are refused rather than ignored.
 */
export const transferUpdateBodySchema = z
  .object({
    version: versionSchema,
    plannedDispatch: calendarDateSchema,
    plannedArrival: calendarDateSchema,
    material: refused(TRANSFER_IMMUTABLE_MESSAGE),
    source: refused(TRANSFER_IMMUTABLE_MESSAGE),
    destination: refused(TRANSFER_IMMUTABLE_MESSAGE),
    quantity: refused(TRANSFER_IMMUTABLE_MESSAGE),
    unit: refused(TRANSFER_IMMUTABLE_MESSAGE),
  })
  .superRefine(arrivalNotBeforeDispatch);

/**
 * `POST …/transfers/{id}/dispatches` and `…/receipts`, and their dialogs (spec Q4, Q5): a quantity in
 * any unit the material converts. No date: a posting is dated today (INV-010, TRF-023).
 */
export const transferPostingSchema = z.object({ quantity: enteredQuantitySchema, unit: unitSchema });

export type TransferPostingInput = z.infer<typeof transferPostingSchema>;

/** `POST …/transfers/{id}/write-offs`, and the Write off dialog (spec Q6): a quantity and the reason it was lost. */
export const transferWriteOffSchema = transferPostingSchema.extend({ reason: stockReasonSchema });

export type TransferWriteOffInput = z.infer<typeof transferWriteOffSchema>;

/** `GET /api/tenants/{tenant}/transfers?page=N` and the list page: a 1-based page of `TRANSFER_PAGE_SIZE`. */
export const transferListSchema = z.strictObject({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) });
