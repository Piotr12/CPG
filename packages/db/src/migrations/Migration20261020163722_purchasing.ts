import { Migration } from '@mikro-orm/migrations';

export class Migration20261020163722_purchasing extends Migration {

  override name = 'Migration20261020163722_purchasing';

  override up(): void | Promise<void> {
    this.addSql(`create table \`purchase_requisition\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`material_id\` text not null, \`location_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`required_date\` text not null, \`converted\` text not null, \`status\` text not null default 'open', \`created_at\` datetime not null, \`version\` integer not null default 1, constraint \`purchase_requisition_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`purchase_requisition_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`purchase_requisition_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`purchase_requisition_tenant_code_index\` on \`purchase_requisition\` (\`tenant_code\`);`);
    this.addSql(`create index \`purchase_requisition_material_id_index\` on \`purchase_requisition\` (\`material_id\`);`);
    this.addSql(`create index \`purchase_requisition_location_id_index\` on \`purchase_requisition\` (\`location_id\`);`);
    this.addSql(`create unique index \`purchase_requisition_tenant_code_code_unique\` on \`purchase_requisition\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`purchase_order\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`supplier_id\` text not null, \`location_id\` text not null, \`status\` text not null default 'open', \`created_at\` datetime not null, \`updated_at\` datetime not null, \`version\` integer not null default 1, constraint \`purchase_order_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`purchase_order_supplier_id_foreign\` foreign key (\`supplier_id\`) references \`supplier\` (\`id\`), constraint \`purchase_order_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`purchase_order_tenant_code_index\` on \`purchase_order\` (\`tenant_code\`);`);
    this.addSql(`create index \`purchase_order_supplier_id_index\` on \`purchase_order\` (\`supplier_id\`);`);
    this.addSql(`create index \`purchase_order_location_id_index\` on \`purchase_order\` (\`location_id\`);`);
    this.addSql(`create unique index \`purchase_order_tenant_code_code_unique\` on \`purchase_order\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`purchase_order_line\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`order_id\` text not null, \`position\` integer not null, \`material_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`planned_date\` text not null, \`requisition_id\` text null, constraint \`purchase_order_line_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`purchase_order_line_order_id_foreign\` foreign key (\`order_id\`) references \`purchase_order\` (\`id\`), constraint \`purchase_order_line_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`purchase_order_line_requisition_id_foreign\` foreign key (\`requisition_id\`) references \`purchase_requisition\` (\`id\`) on delete set null);`);
    this.addSql(`create index \`purchase_order_line_tenant_code_index\` on \`purchase_order_line\` (\`tenant_code\`);`);
    this.addSql(`create index \`purchase_order_line_order_id_index\` on \`purchase_order_line\` (\`order_id\`);`);
    this.addSql(`create index \`purchase_order_line_material_id_index\` on \`purchase_order_line\` (\`material_id\`);`);
    this.addSql(`create index \`purchase_order_line_requisition_id_index\` on \`purchase_order_line\` (\`requisition_id\`);`);
    this.addSql(`create unique index \`purchase_order_line_order_id_position_unique\` on \`purchase_order_line\` (\`order_id\`, \`position\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`purchase_requisition\`;`);
    this.addSql(`drop table if exists \`purchase_order\`;`);
    this.addSql(`drop table if exists \`purchase_order_line\`;`);
  }

}
