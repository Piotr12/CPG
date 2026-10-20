import { Migration } from '@mikro-orm/migrations';

export class Migration20261020164229_stock_ledger extends Migration {

  override name = 'Migration20261020164229_stock_ledger';

  override up(): void | Promise<void> {
    this.addSql(`create table \`stock_movement\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`posting_id\` text not null, \`position\` integer not null, \`type\` text not null, \`material_id\` text not null, \`location_id\` text not null, \`business_date\` text not null, \`occurred_at\` datetime not null, \`quantity\` text not null, \`base_unit\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`balance_before\` text not null, \`balance_after\` text not null, \`reason\` text not null, \`actor_user_id\` text null, \`actor_username\` text not null, \`channel\` text check (\`channel\` in ('ui', 'api', 'seed')) not null, constraint \`stock_movement_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`stock_movement_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`stock_movement_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`stock_movement_tenant_code_index\` on \`stock_movement\` (\`tenant_code\`);`);
    this.addSql(`create index \`stock_movement_material_id_index\` on \`stock_movement\` (\`material_id\`);`);
    this.addSql(`create index \`stock_movement_location_id_index\` on \`stock_movement\` (\`location_id\`);`);
    this.addSql(`create index \`stock_movement_tenant_code_material_id_location_id_occurred_at_index\` on \`stock_movement\` (\`tenant_code\`, \`material_id\`, \`location_id\`, \`occurred_at\`);`);
    this.addSql(`create unique index \`stock_movement_tenant_code_posting_id_position_unique\` on \`stock_movement\` (\`tenant_code\`, \`posting_id\`, \`position\`);`);
    this.addSql(`create trigger \`stock_movement_no_update\` BEFORE UPDATE on \`stock_movement\` for each ROW begin select raise(abort, 'Stock movements are immutable'); end;`);

    this.addSql(`create table \`stock_balance\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`material_id\` text not null, \`location_id\` text not null, \`quantity\` text not null, \`version\` integer not null default 1, constraint \`stock_balance_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`stock_balance_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`stock_balance_location_id_foreign\` foreign key (\`location_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`stock_balance_tenant_code_index\` on \`stock_balance\` (\`tenant_code\`);`);
    this.addSql(`create index \`stock_balance_material_id_index\` on \`stock_balance\` (\`material_id\`);`);
    this.addSql(`create index \`stock_balance_location_id_index\` on \`stock_balance\` (\`location_id\`);`);
    this.addSql(`create unique index \`stock_balance_material_id_location_id_unique\` on \`stock_balance\` (\`material_id\`, \`location_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists \`stock_movement_no_update\`;`);
    this.addSql(`drop table if exists \`stock_movement\`;`);
    this.addSql(`drop table if exists \`stock_balance\`;`);
  }

}
