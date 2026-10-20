import { Migration } from '@mikro-orm/migrations';

export class Migration20261020054509_planning_parameters_safety_stock extends Migration {

  override name = 'Migration20261020054509_planning_parameters_safety_stock';

  override up(): void | Promise<void> {
    this.addSql(`create table \`safety_stock_target\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`material_id\` text not null, \`location_id\` text not null, \`effective_from\` text not null, \`quantity\` text not null, \`version\` integer not null default 1, constraint \`safety_stock_target_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`safety_stock_target_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`safety_stock_target_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`safety_stock_target_tenant_code_index\` on \`safety_stock_target\` (\`tenant_code\`);`);
    this.addSql(`create index \`safety_stock_target_material_id_index\` on \`safety_stock_target\` (\`material_id\`);`);
    this.addSql(`create index \`safety_stock_target_location_id_index\` on \`safety_stock_target\` (\`location_id\`);`);
    this.addSql(`create unique index \`safety_stock_target_material_id_location_id_effective_from_unique\` on \`safety_stock_target\` (\`material_id\`, \`location_id\`, \`effective_from\`);`);

    this.addSql(`create table \`planning_parameter_set\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`material_id\` text not null, \`location_id\` text not null, \`procurement\` text check (\`procurement\` in ('make', 'buy')) not null, \`lead_time_days\` integer not null, \`minimum_quantity\` text not null, \`lot_multiple\` text not null, \`version\` integer not null default 1, constraint \`planning_parameter_set_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`planning_parameter_set_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`planning_parameter_set_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`planning_parameter_set_tenant_code_index\` on \`planning_parameter_set\` (\`tenant_code\`);`);
    this.addSql(`create index \`planning_parameter_set_material_id_index\` on \`planning_parameter_set\` (\`material_id\`);`);
    this.addSql(`create index \`planning_parameter_set_location_id_index\` on \`planning_parameter_set\` (\`location_id\`);`);
    this.addSql(`create unique index \`planning_parameter_set_material_id_location_id_unique\` on \`planning_parameter_set\` (\`material_id\`, \`location_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`safety_stock_target\`;`);
    this.addSql(`drop table if exists \`planning_parameter_set\`;`);
  }

}
