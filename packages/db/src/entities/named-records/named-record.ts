import { Customer } from "../customers/customer.entity";
import { Location } from "../locations/location.entity";
import { Supplier } from "../suppliers/supplier.entity";

/** The entity of any master with only an ID, a name and an active flag. */
export type NamedRecordEntity = typeof Location | typeof Customer | typeof Supplier;

/** A row of any of them: the same fields in each. */
export type NamedRecord = Location | Customer | Supplier;
