import { Migration } from '@mikro-orm/migrations';

export class Migration20261020164210_forecasts extends Migration {

  override name = 'Migration20261020164210_forecasts';

  override up(): void | Promise<void> {
    this.addSql(`create table \`forecast\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`material_id\` text not null, \`location_id\` text not null, \`date\` text not null, \`quantity\` text not null, \`version\` integer not null default 1, constraint \`forecast_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`forecast_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`forecast_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`forecast_tenant_code_index\` on \`forecast\` (\`tenant_code\`);`);
    this.addSql(`create index \`forecast_material_id_index\` on \`forecast\` (\`material_id\`);`);
    this.addSql(`create index \`forecast_location_id_index\` on \`forecast\` (\`location_id\`);`);
    this.addSql(`create unique index \`forecast_material_id_location_id_date_unique\` on \`forecast\` (\`material_id\`, \`location_id\`, \`date\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`forecast\`;`);
  }

}
