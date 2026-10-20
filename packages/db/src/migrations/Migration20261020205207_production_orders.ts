import { Migration } from '@mikro-orm/migrations';

export class Migration20261020205207_production_orders extends Migration {

  override name = 'Migration20261020205207_production_orders';

  override up(): void | Promise<void> {
    this.addSql(`create table \`production_order\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`output_id\` text not null, \`location_id\` text not null, \`recipe_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`planned_finish\` text not null, \`planned_start\` text not null, \`lead_time_days\` integer not null, \`produced\` text not null default '0.000000', \`abandoned\` text not null default '0.000000', \`status\` text check (\`status\` in ('open', 'completed', 'closed-early', 'cancelled')) not null default 'open', \`created_at\` datetime not null, \`updated_at\` datetime not null, \`version\` integer not null default 1, constraint \`production_order_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`production_order_output_id_foreign\` foreign key (\`output_id\`) references \`material\` (\`id\`), constraint \`production_order_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`), constraint \`production_order_recipe_id_foreign\` foreign key (\`recipe_id\`) references \`bom_revision\` (\`id\`));`);
    this.addSql(`create index \`production_order_tenant_code_index\` on \`production_order\` (\`tenant_code\`);`);
    this.addSql(`create index \`production_order_output_id_index\` on \`production_order\` (\`output_id\`);`);
    this.addSql(`create index \`production_order_location_id_index\` on \`production_order\` (\`location_id\`);`);
    this.addSql(`create index \`production_order_recipe_id_index\` on \`production_order\` (\`recipe_id\`);`);
    this.addSql(`create index \`production_order_tenant_code_location_id_status_index\` on \`production_order\` (\`tenant_code\`, \`location_id\`, \`status\`);`);
    this.addSql(`create index \`production_order_tenant_code_output_id_status_index\` on \`production_order\` (\`tenant_code\`, \`output_id\`, \`status\`);`);
    this.addSql(`create unique index \`production_order_tenant_code_code_unique\` on \`production_order\` (\`tenant_code\`, \`code\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`production_order\`;`);
  }

}
