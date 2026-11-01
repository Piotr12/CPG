import { Migration } from '@mikro-orm/migrations';

export class Migration20261101080923_mrp_run_exceptions extends Migration {

  override name = 'Migration20261101080923_mrp_run_exceptions';

  override up(): void | Promise<void> {
    this.addSql(`create table \`mrp_run_exception\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`run_id\` text not null, \`position\` integer not null, \`exception_code\` text not null, \`material\` text not null, \`location\` text not null, \`date\` text null, \`details\` json null, constraint \`mrp_run_exception_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`mrp_run_exception_run_id_foreign\` foreign key (\`run_id\`) references \`mrp_run\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`mrp_run_exception_tenant_code_index\` on \`mrp_run_exception\` (\`tenant_code\`);`);
    this.addSql(`create index \`mrp_run_exception_run_id_index\` on \`mrp_run_exception\` (\`run_id\`);`);
    this.addSql(`create unique index \`mrp_run_exception_tenant_code_run_id_material_location_position_unique\` on \`mrp_run_exception\` (\`tenant_code\`, \`run_id\`, \`material\`, \`location\`, \`position\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`mrp_run_exception\`;`);
  }

}
