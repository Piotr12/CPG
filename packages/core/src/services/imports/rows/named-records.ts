import type { SheetRow } from "../../../domain/imports/prepare-import";
import { sheetSpec } from "../../../domain/imports/workbook-layout";
import type { NamedRecordRow } from "../../../validators/imports/import-rows.schema";
import type { NamedRecordView } from "../../named-records/named-records";
import { changesBetween, createdValues, existing, noteVersion, runRow, type ApplyContext } from "../apply-context";

const FIELDS = [
  ["name", "Name"],
  ["active", "Active"],
] as const;

/** One named-record kind as the import sees it: its sheet, its service, and how it is named. */
interface Kind {
  key: "locations" | "customers" | "suppliers";
  /** The audit subject and version kind: `"Location"`. */
  type: string;
  noun: string;
  notFound: string;
  service: {
    get(id: string): Promise<NamedRecordView>;
    create(input: { name: string }, actor: ApplyContext["actor"]): Promise<NamedRecordView>;
    update(id: string, changes: { name?: string; active?: boolean }, version: number, actor: ApplyContext["actor"]): Promise<NamedRecordView>;
  };
}

/** The kinds in apply order, each bound to its service. */
export function namedRecordKinds({ services }: ApplyContext): Kind[] {
  return [
    { key: "locations", type: "Location", noun: "location", notFound: "LOCATION_NOT_FOUND", service: services.locationService },
    { key: "customers", type: "Customer", noun: "customer", notFound: "CUSTOMER_NOT_FOUND", service: services.customerService },
    { key: "suppliers", type: "Supplier", noun: "supplier", notFound: "SUPPLIER_NOT_FOUND", service: services.supplierService },
  ];
}

const label = ({ id, name }: NamedRecordView) => `${id} — ${name}`;

/** The Locations, Customers or Suppliers sheet: a blank ID creates, a known ID updates. */
export async function importNamedRecords(context: ApplyContext, kind: Kind, rows: SheetRow<NamedRecordRow>[]): Promise<void> {
  const sheet = sheetSpec(kind.key).name;
  for (const { row, values } of rows) {
    const { id, name, active } = values;
    await runRow(context, kind.key, row, async () => {
      if (id === null) {
        const created = await kind.service.create({ name }, context.actor);
        return { sheet, row, action: "create", record: created.id, label: label(created), changes: createdValues(created, FIELDS) };
      }
      const before = await existing(context, () => kind.service.get(id), kind.notFound, kind.noun, id);
      noteVersion(context, kind.type, id, before.version);
      const after = await kind.service.update(id, active === null ? { name } : { name, active }, before.version, context.actor);
      const action = after.version === before.version ? "unchanged" : "update";
      return { sheet, row, action, record: id, label: label(after), changes: changesBetween(before, after, FIELDS) };
    });
  }
}
