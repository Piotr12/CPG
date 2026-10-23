/**
 * Every field an audit snapshot may carry (R08, UX-022). The recorder refuses any other, so a new field
 * fails its service's tests until it is listed here, and `tests/audit-labels.test.ts` then fails until it
 * is named in English and Polish. Stored entries keep the fields they were written with.
 */
export const AUDIT_FIELDS = [
  "abandoned", "active", "balance", "baseUnit", "bom", "businessDate", "completion", "components", "converted",
  "customer", "customerOrder", "dataset", "date", "denominator", "description", "destination", "dispatched",
  "effectiveFrom", "enteredQuantity", "enteredUnit", "fulfilled", "generation", "id", "inTransit", "issue", "issued",
  "kind", "leadTimeDays", "line", "lineStatus", "lines", "locale", "location", "lotMultiple", "material",
  "minimumQuantity", "moved", "movement", "movements", "name", "numerator", "order", "original", "output",
  "plannedArrival", "plannedDate", "plannedDispatch", "plannedFinish", "plannedStart", "posting", "postingId",
  "priority", "procurement", "produced", "purchaseOrder", "quantity", "readOnly", "reason", "receipt", "received",
  "requiredDate", "reversal", "reversed", "revision", "role", "shipment", "source", "status", "supplier", "theme",
  "type", "unit", "username", "validFrom", "validThrough", "writtenOff",
] as const;

/** The fields a document line repeats per line number, as `line{n}{Field}`: `line2Received`. */
export const AUDIT_LINE_FIELDS = ["actual", "expected", "extra", "fulfilled", "issued", "material", "plannedDate", "received", "status", "variance"] as const;

/** A completion reversal's movement pairs, `movement{n}Original` and `movement{n}Inverse`. */
export const AUDIT_MOVEMENT_ROLES = ["original", "inverse"] as const;

const LISTED = new Set<string>(AUDIT_FIELDS);
const LINE_FIELD = /^line[1-9]\d*([A-Z]\w*)$/;
const MOVEMENT_FIELD = /^movement[1-9]\d*([A-Z]\w*)$/;

/** Whether a snapshot may carry `name`: a listed field, or a numbered line or movement field. */
export function isAuditField(name: string): boolean {
  const numbered = (pattern: RegExp, names: readonly string[]) => {
    const match = pattern.exec(name);
    return match !== null && names.includes(match[1][0].toLowerCase() + match[1].slice(1));
  };
  return LISTED.has(name) || numbered(LINE_FIELD, AUDIT_LINE_FIELDS) || numbered(MOVEMENT_FIELD, AUDIT_MOVEMENT_ROLES);
}
