import { Location, type EntityManager } from "@cpg/db";
import { DEMO_LOCATIONS } from "../../domain/locations/demo-locations";
import type { AuditActor } from "../audit/actor";
import { NamedRecords, type NamedRecordChanges, type NamedRecordView } from "../named-records/named-records";

interface Deps {
  em: EntityManager;
}

/**
 * A tenant's locations (E03-S02): where materials are made and stocked. Resolved from a tenant scope, so every read and
 * write is that tenant's only (R05). The admin maintains them, which callers check with `assertAdmin`
 * before a write. The rules are the shared `NamedRecords` ones (spec Q9).
 */
export class LocationService {
  private readonly records: NamedRecords;

  constructor({ em }: Deps) {
    this.records = new NamedRecords(em, {
      entity: Location,
      subjectType: "Location",
      noun: "location",
      actionPrefix: "locations.location",
      codePrefix: "LOCATION",
      demoNames: DEMO_LOCATIONS,
    });
  }

  list(): Promise<NamedRecordView[]> {
    return this.records.list();
  }

  get(id: string): Promise<NamedRecordView> {
    return this.records.get(id);
  }

  create(input: { name: string }, actor: AuditActor): Promise<NamedRecordView> {
    return this.records.create(input, actor);
  }

  update(id: string, changes: NamedRecordChanges, version: number, actor: AuditActor): Promise<NamedRecordView> {
    return this.records.update(id, changes, version, actor);
  }

  seedDemo(): Promise<number> {
    return this.records.seedDemo();
  }
}
