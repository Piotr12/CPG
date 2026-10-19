import { Migration } from '@mikro-orm/migrations';

export class Migration20261019191302_materials extends Migration {

  override name = 'Migration20261019191302_materials';

  override up(): void | Promise<void> {
    this.addSql(`create table \`material\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`type\` text check (\`type\` in ('raw', 'intermediate', 'finished')) not null, \`description\` text not null, \`base_unit\` text not null, \`active\` integer not null default true, \`created_at\` datetime not null, \`version\` integer not null default 1, constraint \`material_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`));`);
    this.addSql(`create index \`material_tenant_code_index\` on \`material\` (\`tenant_code\`);`);
    this.addSql(`create unique index \`material_tenant_code_code_unique\` on \`material\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`material_conversion\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`material_id\` text not null, \`unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`version\` integer not null default 1, constraint \`material_conversion_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`material_conversion_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`));`);
    this.addSql(`create index \`material_conversion_tenant_code_index\` on \`material_conversion\` (\`tenant_code\`);`);
    this.addSql(`create index \`material_conversion_material_id_index\` on \`material_conversion\` (\`material_id\`);`);
    this.addSql(`create unique index \`material_conversion_material_id_unit_unique\` on \`material_conversion\` (\`material_id\`, \`unit\`);`);
  }

  override down(): void | Promise<void> {
    // Conversions first: they reference materials, and SQLite checks the foreign key on the drop.
    this.addSql(`drop table if exists \`material_conversion\`;`);
    this.addSql(`drop table if exists \`material\`;`);
  }

}
