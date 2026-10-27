import { Migration } from '@mikro-orm/migrations';

export class Migration20261027061605_mrp_runs extends Migration {

  override name = 'Migration20261027061605_mrp_runs';

  override up(): void | Promise<void> {
    this.addSql(`create table \`mrp_run\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`created_at\` datetime not null, \`start_date\` text not null, \`horizon_days\` integer not null, \`mode\` text check (\`mode\` in ('manual', 'automatic')) not null, \`generation\` integer not null, \`pairs\` integer not null, \`actor_user_id\` text not null, \`actor_username\` text not null, \`channel\` text check (\`channel\` in ('ui', 'api')) not null, constraint \`mrp_run_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`));`);
    this.addSql(`create index \`mrp_run_tenant_code_index\` on \`mrp_run\` (\`tenant_code\`);`);
    this.addSql(`create unique index \`mrp_run_tenant_code_code_unique\` on \`mrp_run\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`mrp_daily_result\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`run_id\` text not null, \`material\` text not null, \`location\` text not null, \`date\` text not null, \`firm_demand\` text not null, \`forecast_demand\` text not null, \`dependent_demand\` text not null, \`transfer_out\` text not null, \`tentative_supply\` text not null, \`dependable_supply\` text not null, \`at_risk_supply\` text not null, \`transfer_in\` text not null, \`proposed_receipts\` text not null, \`safety_target\` text not null, \`projected_before\` text not null, \`projected_after\` text not null, \`shortage\` text not null, constraint \`mrp_daily_result_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`mrp_daily_result_run_id_foreign\` foreign key (\`run_id\`) references \`mrp_run\` (\`id\`));`);
    this.addSql(`create index \`mrp_daily_result_tenant_code_index\` on \`mrp_daily_result\` (\`tenant_code\`);`);
    this.addSql(`create index \`mrp_daily_result_run_id_index\` on \`mrp_daily_result\` (\`run_id\`);`);
    this.addSql(`create unique index \`mrp_daily_result_tenant_code_run_id_material_location_date_unique\` on \`mrp_daily_result\` (\`tenant_code\`, \`run_id\`, \`material\`, \`location\`, \`date\`);`);
  }

  override down(): void | Promise<void> {
    // Results first: they reference their run.
    this.addSql(`drop table if exists \`mrp_daily_result\`;`);
    this.addSql(`drop table if exists \`mrp_run\`;`);
  }

}
