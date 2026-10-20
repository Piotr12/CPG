import { Migration } from '@mikro-orm/migrations';

export class Migration20261020080940_boms extends Migration {

  override name = 'Migration20261020080940_boms';

  override up(): void | Promise<void> {
    this.addSql(`create table \`bom\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`output_id\` text not null, \`active\` integer not null default true, \`revision\` integer not null, \`created_at\` datetime not null, \`version\` integer not null default 1, constraint \`bom_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`bom_output_id_foreign\` foreign key (\`output_id\`) references \`material\` (\`id\`));`);
    this.addSql(`create index \`bom_tenant_code_index\` on \`bom\` (\`tenant_code\`);`);
    this.addSql(`create index \`bom_output_id_index\` on \`bom\` (\`output_id\`);`);
    this.addSql(`create unique index \`bom_tenant_code_code_unique\` on \`bom\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`bom_revision\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`bom_id\` text not null, \`number\` integer not null, \`priority\` integer not null, \`valid_from\` text not null, \`valid_through\` text null, \`created_at\` datetime not null, constraint \`bom_revision_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`bom_revision_bom_id_foreign\` foreign key (\`bom_id\`) references \`bom\` (\`id\`));`);
    this.addSql(`create index \`bom_revision_tenant_code_index\` on \`bom_revision\` (\`tenant_code\`);`);
    this.addSql(`create index \`bom_revision_bom_id_index\` on \`bom_revision\` (\`bom_id\`);`);
    this.addSql(`create unique index \`bom_revision_bom_id_number_unique\` on \`bom_revision\` (\`bom_id\`, \`number\`);`);
    this.addSql(`create trigger \`bom_revision_no_update\` BEFORE UPDATE on \`bom_revision\` for each ROW begin select raise(abort, 'BOM revisions are immutable'); end;`);

    this.addSql(`create table \`bom_component\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`revision_id\` text not null, \`position\` integer not null, \`material_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, constraint \`bom_component_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`bom_component_revision_id_foreign\` foreign key (\`revision_id\`) references \`bom_revision\` (\`id\`), constraint \`bom_component_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`));`);
    this.addSql(`create index \`bom_component_tenant_code_index\` on \`bom_component\` (\`tenant_code\`);`);
    this.addSql(`create index \`bom_component_revision_id_index\` on \`bom_component\` (\`revision_id\`);`);
    this.addSql(`create index \`bom_component_material_id_index\` on \`bom_component\` (\`material_id\`);`);
    this.addSql(`create unique index \`bom_component_revision_id_material_id_unique\` on \`bom_component\` (\`revision_id\`, \`material_id\`);`);
    this.addSql(`create trigger \`bom_component_no_update\` BEFORE UPDATE on \`bom_component\` for each ROW begin select raise(abort, 'BOM revisions are immutable'); end;`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop table if exists \`bom\`;`);
    this.addSql(`drop trigger if exists \`bom_revision_no_update\`;`);
    this.addSql(`drop table if exists \`bom_revision\`;`);
    this.addSql(`drop trigger if exists \`bom_component_no_update\`;`);
    this.addSql(`drop table if exists \`bom_component\`;`);
  }

}
