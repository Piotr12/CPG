import { Migration } from "@mikro-orm/migrations";

export class Migration20261021071704_document_lifecycle extends Migration {
  override name = "Migration20261021071704_document_lifecycle";

  override up(): void {
    // Add columns in place: the generated table rebuild copied NULL into the new NOT NULL
    // fields and would also unnecessarily disturb immutable goods-receipt references.
    this.addSql("alter table purchase_requisition add column abandoned text not null default '0.000000';");
    this.addSql("alter table purchase_order_line add column abandoned text not null default '0.000000';");
    this.addSql("alter table purchase_order_line add column status text check (status in ('open', 'completed', 'closed-early', 'cancelled')) not null default 'open';");
    // Stored quantities have six decimal places. Integer micro-units fit SQLite's signed 64-bit
    // range (the domain maximum is 18 digits); REAL would round the largest values together.
    this.addSql("update purchase_order_line set status = 'completed' where cast(replace(received, '.', '') as integer) >= cast(replace(quantity, '.', '') as integer);");
    this.addSql("alter table transfer add column abandoned text not null default '0.000000';");
  }

  override down(): void {
    this.addSql("alter table transfer drop column abandoned;");
    this.addSql("alter table purchase_order_line drop column status;");
    this.addSql("alter table purchase_order_line drop column abandoned;");
    this.addSql("alter table purchase_requisition drop column abandoned;");
  }
}
