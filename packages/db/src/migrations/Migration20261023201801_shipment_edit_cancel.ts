import { Migration } from "@mikro-orm/migrations";

/**
 * Shipment edit and cancel (#147): a version, a line counter and the `cancelled` status. Written by
 * hand, in place: the generated table rebuild copied NULL into the new required columns and would
 * recreate a table that goods issues and shipment lines reference (lesson "Verify generated SQLite
 * additions on populated data"). SQLite can't alter a CHECK, so the status moves to a new checked
 * column, which then takes the old one's name; the previous release still finds `status`, with the
 * same values and a wider check.
 */
export class Migration20261023201801_shipment_edit_cancel extends Migration {
  override name = "Migration20261023201801_shipment_edit_cancel";

  override up(): void {
    this.addSql("alter table `shipment` add column `version` integer not null default 1;");
    this.addSql("alter table `shipment` add column `updated_at` datetime not null default 0;");
    this.addSql("update `shipment` set `updated_at` = `created_at`;");
    this.addSql("alter table `shipment` add column `next_line` integer not null default 0;");
    this.addSql("update `shipment` set `next_line` = (select coalesce(max(`position`), -1) + 1 from `shipment_line` where `shipment_line`.`shipment_id` = `shipment`.`id`);");
    this.addSql("alter table `shipment` add column `status_next` text check (`status_next` in ('open', 'completed', 'cancelled')) not null default 'open';");
    this.addSql("update `shipment` set `status_next` = `status`;");
    this.addSql("alter table `shipment` drop column `status`;");
    this.addSql("alter table `shipment` rename column `status_next` to `status`;");
  }

  /** A cancelled shipment becomes Open again: the old check has no other value for it. */
  override down(): void {
    this.addSql("alter table `shipment` add column `status_previous` text check (`status_previous` in ('open', 'completed')) not null default 'open';");
    this.addSql("update `shipment` set `status_previous` = case when `status` = 'completed' then 'completed' else 'open' end;");
    this.addSql("alter table `shipment` drop column `status`;");
    this.addSql("alter table `shipment` rename column `status_previous` to `status`;");
    this.addSql("alter table `shipment` drop column `next_line`;");
    this.addSql("alter table `shipment` drop column `updated_at`;");
    this.addSql("alter table `shipment` drop column `version`;");
  }
}
