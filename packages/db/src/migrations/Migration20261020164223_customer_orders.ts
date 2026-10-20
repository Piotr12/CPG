import { Migration } from '@mikro-orm/migrations';

export class Migration20261020164223_customer_orders extends Migration {

  override name = 'Migration20261020164223_customer_orders';

  override up(): void | Promise<void> {
    this.addSql(`create table \`customer_order\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`customer_id\` text not null, \`location_id\` text not null, \`status\` text check (\`status\` in ('open', 'completed', 'closed-early', 'cancelled')) not null default 'open', \`created_at\` datetime not null, \`updated_at\` datetime not null, \`version\` integer not null default 1, constraint \`customer_order_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`customer_order_customer_id_foreign\` foreign key (\`customer_id\`) references \`customer\` (\`id\`), constraint \`customer_order_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`customer_order_tenant_code_index\` on \`customer_order\` (\`tenant_code\`);`);
    this.addSql(`create index \`customer_order_customer_id_index\` on \`customer_order\` (\`customer_id\`);`);
    this.addSql(`create index \`customer_order_location_id_index\` on \`customer_order\` (\`location_id\`);`);
    this.addSql(`create unique index \`customer_order_tenant_code_code_unique\` on \`customer_order\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`customer_order_line\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`order_id\` text not null, \`position\` integer not null, \`removed\` integer not null default false, \`material_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`required_date\` text not null, \`fulfilled\` text not null default '0.000000', \`abandoned\` text not null default '0.000000', \`status\` text check (\`status\` in ('open', 'completed', 'closed-early', 'cancelled')) not null default 'open', constraint \`customer_order_line_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`customer_order_line_order_id_foreign\` foreign key (\`order_id\`) references \`customer_order\` (\`id\`), constraint \`customer_order_line_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`));`);
    this.addSql(`create index \`customer_order_line_tenant_code_index\` on \`customer_order_line\` (\`tenant_code\`);`);
    this.addSql(`create index \`customer_order_line_order_id_index\` on \`customer_order_line\` (\`order_id\`);`);
    this.addSql(`create index \`customer_order_line_material_id_index\` on \`customer_order_line\` (\`material_id\`);`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`customer_order_line\`;`);
    this.addSql(`drop table if exists \`customer_order\`;`);
  }

}
