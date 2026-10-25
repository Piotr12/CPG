import { targetStatus, type Locale, type MaterialSummary, type NamedRecordView, type SafetyStockTargetView } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { safetyStockSortSchema, type SafetyStockSort } from "@cpg/core/validators/safety-stock/safety-stock-list.schema";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { fill } from "../forms/form-labels";
import { listLinks, type ListSearchState } from "../lists/list-params";
import { ListSearchBar } from "../lists/list-search-bar";
import { activeMaterialOptions } from "../materials/material-picker";
import { withReferences } from "../master-data/references";
import { activeRecordOptions } from "../named-records/record-picker";
import { AddSafetyStockTargetDialog } from "./add-safety-stock-target-dialog";
import { safetyStockLabels } from "./labels";
import { SafetyStockTable, type SafetyStockRow } from "./safety-stock-table";

interface SafetyStockScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  targets: SafetyStockTargetView[];
  /** The tenant's full lists, for the rows' details and the add form's choices. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  /** The day the status column is about, as `YYYY-MM-DD` (spec Q10: the server's UTC date). */
  today: string;
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Add and the row menus (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
  /** The search and sort the page read from its address, and listed `targets` with (#217). */
  search: ListSearchState;
  sort: { sort: SafetyStockSort; dir: SortDirection };
}

/**
 * The body of the safety stock page (E03-S03): heading, intro, the admin's Add target, the search box
 * and the sortable list (#217). A search keeps whole series, so each target's status still sees every
 * target of its material and location.
 */
export function SafetyStockScreen({ tenant, targets, materials, locations, today, locale, messages, admin, search, sort }: SafetyStockScreenProps) {
  const labels = safetyStockLabels(messages);
  const editable = admin && !tenant.readOnly;
  const links = listLinks({ path: `/admin/${tenant.code}/safety-stock`, search: search.q, sort, defaults: safetyStockSortSchema.parse({}) });
  const rows: SafetyStockRow[] = withReferences(targets, materials, locations).map((target) => {
    const series = targets.filter(({ material, location }) => material === target.material && location === target.location);
    return { ...target, status: targetStatus(series, target, today) };
  });

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.safetyStock.heading(tenant.name)}
        description={fill(labels.intro, { today })}
        actions={
          editable && (
            <AddSafetyStockTargetDialog
              context={{ tenant: tenant.code, generation: tenant.generation }}
              labels={labels}
              materials={activeMaterialOptions(materials)}
              locations={activeRecordOptions(locations)}
              locale={locale}
            />
          )
        }
      />
      <ListSearchBar links={links} search={search} labels={labels.search} lists={messages.lists} locale={locale} count={targets.length} />
      <div className="flex flex-col gap-8">
        <SafetyStockTable tenant={tenant} rows={rows} labels={labels} editable={editable} search={search.q} sort={sort} links={links} lists={messages.lists} />
      </div>
    </div>
  );
}
