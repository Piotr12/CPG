import { z } from "zod";
import {
  IMPORT_FILE_MAX_BYTES,
  IMPORT_INFLATED_MAX_BYTES,
  IMPORT_ROWS_MAX,
} from "../../domain/imports/workbook-layout";

/** The English messages; screens translate them by matching these constants. */
export const WORKBOOK_REQUIRED_MESSAGE = "Choose an .xlsx workbook to upload.";
export const WORKBOOK_TOO_LARGE_MESSAGE = `Upload a workbook of at most ${IMPORT_FILE_MAX_BYTES / 1024} KB.`;
export const WORKBOOK_UNREADABLE_MESSAGE =
  "This file isn't a readable .xlsx workbook.";
export const WORKBOOK_TOO_MANY_ROWS_MESSAGE = `This workbook has more than ${IMPORT_ROWS_MAX} rows. Split it into several imports.`;
export const WORKBOOK_INFLATES_TOO_MUCH_MESSAGE = `This workbook unpacks to more than ${IMPORT_INFLATED_MAX_BYTES / 1024 / 1024} MB.`;
export const PREVIEW_TOKEN_MESSAGE =
  "Run a dry run first, then commit with its previewToken.";

/** The base64 length of the largest accepted file: every 3 bytes become 4 characters. */
export const WORKBOOK_BASE64_MAX = Math.ceil(IMPORT_FILE_MAX_BYTES / 3) * 4;

// `*`, not `+`: an empty string is only the "required" error.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * The uploaded workbook (spec `2026-10-20--0908UTC-master-data-bom-import`, Q13): the `.xlsx` file
 * as standard base64, at most 512 KB once decoded. Whether it is a readable workbook is the
 * adapter's check.
 */
export const workbookSchema = z
  .string({ error: WORKBOOK_REQUIRED_MESSAGE })
  .min(1, WORKBOOK_REQUIRED_MESSAGE)
  .max(WORKBOOK_BASE64_MAX, WORKBOOK_TOO_LARGE_MESSAGE)
  .regex(BASE64, WORKBOOK_UNREADABLE_MESSAGE);

/** A dry run's preview token: the SHA-256 it returned, in lowercase hex (Q7). */
export const previewTokenSchema = z
  .string({ error: PREVIEW_TOKEN_MESSAGE })
  .regex(/^[0-9a-f]{64}$/, PREVIEW_TOKEN_MESSAGE);

/** `POST /api/tenants/{tenant}/import/dry-run` and the screen's dry run. */
export const importDryRunSchema = z.object({ workbook: workbookSchema });

/** `POST /api/tenants/{tenant}/import/commit` and the screen's commit: the same workbook and the dry run's token. */
export const importCommitSchema = z.object({
  workbook: workbookSchema,
  previewToken: previewTokenSchema,
});

export type ImportDryRunInput = z.infer<typeof importDryRunSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;
