import { Migration } from '@mikro-orm/migrations';

export class Migration20261020223625_production_completions extends Migration {

  override name = 'Migration20261020223625_production_completions';

  override up(): void | Promise<void> {
    this.addSql(`create table \`production_completion\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`order_id\` text not null, \`business_date\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`submission\` text null, \`created_at\` datetime not null, constraint \`production_completion_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`production_completion_order_id_foreign\` foreign key (\`order_id\`) references \`production_order\` (\`id\`));`);
    this.addSql(`create index \`production_completion_tenant_code_index\` on \`production_completion\` (\`tenant_code\`);`);
    this.addSql(`create index \`production_completion_order_id_index\` on \`production_completion\` (\`order_id\`);`);
    this.addSql(`create index \`production_completion_tenant_code_order_id_code_index\` on \`production_completion\` (\`tenant_code\`, \`order_id\`, \`code\`);`);
    this.addSql(`create unique index \`production_completion_tenant_code_code_unique\` on \`production_completion\` (\`tenant_code\`, \`code\`);`);
    this.addSql(`create unique index \`production_completion_tenant_code_submission_unique\` on \`production_completion\` (\`tenant_code\`, \`submission\`);`);
    this.addSql(`create trigger \`production_completion_no_update\` BEFORE UPDATE on \`production_completion\` for each ROW begin select raise(abort, 'Production completions are immutable'); end;`);

    this.addSql(`create table \`production_completion_line\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`completion_id\` text not null, \`position\` integer not null, \`material_id\` text not null, \`expected\` text not null, \`actual\` text not null, \`variance\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`extra\` integer not null, constraint \`production_completion_line_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`production_completion_line_completion_id_foreign\` foreign key (\`completion_id\`) references \`production_completion\` (\`id\`), constraint \`production_completion_line_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`));`);
    this.addSql(`create index \`production_completion_line_tenant_code_index\` on \`production_completion_line\` (\`tenant_code\`);`);
    this.addSql(`create index \`production_completion_line_completion_id_index\` on \`production_completion_line\` (\`completion_id\`);`);
    this.addSql(`create index \`production_completion_line_material_id_index\` on \`production_completion_line\` (\`material_id\`);`);
    this.addSql(`create unique index \`production_completion_line_completion_id_position_unique\` on \`production_completion_line\` (\`completion_id\`, \`position\`);`);
    this.addSql(`create unique index \`production_completion_line_completion_id_material_id_unique\` on \`production_completion_line\` (\`completion_id\`, \`material_id\`);`);
    this.addSql(`create trigger \`production_completion_line_no_update\` BEFORE UPDATE on \`production_completion_line\` for each ROW begin select raise(abort, 'Production completions are immutable'); end;`);
  }

  override down(): void | Promise<void> {

    this.addSql(`drop trigger if exists \`production_completion_line_no_update\`;`);
    this.addSql(`drop table if exists \`production_completion_line\`;`);
    this.addSql(`drop trigger if exists \`production_completion_no_update\`;`);
    this.addSql(`drop table if exists \`production_completion\`;`);
  }

}
