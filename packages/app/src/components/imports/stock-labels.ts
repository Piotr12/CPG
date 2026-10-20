import { STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import type { Messages } from "../../i18n/messages/en";
import { importLabels, type ImportLabels } from "./labels";

/**
 * The Stock import screen's strings (spec 2026-10-20--2225UTC-stock-import): the Import screen's,
 * with the stock wording over them, the stock screen's error codes, and the commit's reason field.
 * Plain data, like `importLabels`.
 */
export function stockImportLabels(messages: Messages): ImportLabels {
  const base = importLabels(messages);
  const own = messages.stockImport;
  return {
    ...base,
    template: own.template,
    upload: { ...base.upload, ...own.upload },
    summary: { ...base.summary, ...own.summary },
    preview: { ...base.preview, ...own.preview },
    actions: { ...base.actions, ...own.actions },
    results: { ...base.results, ...own.results },
    change: { ...base.change, fields: own.change },
    commit: { ...base.commit, ...own.commit },
    readOnly: own.readOnly,
    issues: { ...base.issues, ...own.issues },
    errors: { ...base.errors, ...messages.stock.errors, ...own.errors },
    fieldMessages: { ...base.fieldMessages, [STOCK_REASON_MESSAGE]: messages.stock.fieldErrors.reason },
    reason: own.reason,
  };
}
