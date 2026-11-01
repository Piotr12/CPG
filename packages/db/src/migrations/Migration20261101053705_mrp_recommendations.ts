import { Migration } from '@mikro-orm/migrations';

export class Migration20261101053705_mrp_recommendations extends Migration {

  override name = 'Migration20261101053705_mrp_recommendations';

  override up(): void | Promise<void> {
    this.addSql(`create table \`mrp_recommendation\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`run_id\` text not null, \`material\` text not null, \`location\` text not null, \`kind\` text check (\`kind\` in ('purchase-requisition', 'production-order')) not null, \`need_date\` text not null, \`quantity\` text not null, constraint \`mrp_recommendation_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`mrp_recommendation_run_id_foreign\` foreign key (\`run_id\`) references \`mrp_run\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`mrp_recommendation_tenant_code_index\` on \`mrp_recommendation\` (\`tenant_code\`);`);
    this.addSql(`create index \`mrp_recommendation_run_id_index\` on \`mrp_recommendation\` (\`run_id\`);`);
    this.addSql(`create unique index \`mrp_recommendation_tenant_code_run_id_material_location_need_date_unique\` on \`mrp_recommendation\` (\`tenant_code\`, \`run_id\`, \`material\`, \`location\`, \`need_date\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`mrp_recommendation\`;`);
  }

}
