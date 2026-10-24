import type { Locale, MaterialSummary, NamedRecordView, RequisitionView } from "@cpg/core";
import type { RequisitionSort } from "@cpg/core/validators/purchasing/purchase-requisition-list.schema";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { ListSearchBar } from "../lists/list-search-bar";
import type { DocumentListState } from "../purchasing/list-state";
import { activeOptions, materialPicks } from "./choices";
import { CreateRequisitionDialog } from "./create-requisition-dialog";
import { byId, requisitionsLabels } from "./labels";
import { RequisitionsTable } from "./requisitions-table";

interface RequisitionsScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  requisitions: RequisitionView[];
  /** The 1-based page of `requisitions` and how many pages the tenant's requisitions make. */
  page: number;
  pages: number;
  /** The list's search and sort (#217). */
  list: DocumentListState<RequisitionSort>;
  /** The tenant's materials and locations, for the rows' details and the form's choices, and each material's units. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  units: Record<string, string[]>;
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Purchase requisitions page (E09-S01): heading, intro, Create requisition, the
 * search box (#217) and the list. Any signed-in account may create, but not while the tenant is read-only (R05).
 */
export function RequisitionsScreen({ tenant, requisitions, page, pages, list, materials, locations, units, locale, messages }: RequisitionsScreenProps) {
  const labels = requisitionsLabels(messages);
  const editable = !tenant.readOnly;

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.purchaseRequisitions.heading(tenant.name)}
        description={labels.intro}
        actions={editable && (
          <CreateRequisitionDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialPicks(materials, units)}
            locations={activeOptions(locations)}
            locale={locale}
          />
        )}
      />
      <ListSearchBar links={list.links} search={list.search} labels={labels.search} lists={messages.lists} locale={locale} count={list.count} />
      <RequisitionsTable
        tenant={tenant}
        requisitions={requisitions}
        page={page}
        pages={pages}
        materials={byId(materials)}
        locations={byId(locations)}
        labels={labels}
        editable={editable}
        search={list.search.q}
        sort={list.sort}
        links={list.links}
        lists={messages.lists}
      />
    </div>
  );
}
