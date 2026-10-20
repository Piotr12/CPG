import { Migration } from '@mikro-orm/migrations';

export class Migration20261020205226_transfers extends Migration {

  override name = 'Migration20261020205226_transfers';

  override up(): void | Promise<void> {
    this.addSql(`create table \`transfer\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`material_id\` text not null, \`source_id\` text not null, \`destination_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`planned_dispatch\` text not null, \`planned_arrival\` text not null, \`dispatched\` text not null default '0.000000', \`received\` text not null default '0.000000', \`written_off\` text not null default '0.000000', \`status\` text not null default 'open', \`created_at\` datetime not null, \`updated_at\` datetime not null, \`version\` integer not null default 1, constraint \`transfer_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`transfer_material_id_foreign\` foreign key (\`material_id\`) references \`material\` (\`id\`), constraint \`transfer_source_id_foreign\` foreign key (\`source_id\`) references \`location\` (\`id\`), constraint \`transfer_destination_id_foreign\` foreign key (\`destination_id\`) references \`location\` (\`id\`));`);
    this.addSql(`create index \`transfer_tenant_code_index\` on \`transfer\` (\`tenant_code\`);`);
    this.addSql(`create index \`transfer_material_id_index\` on \`transfer\` (\`material_id\`);`);
    this.addSql(`create index \`transfer_source_id_index\` on \`transfer\` (\`source_id\`);`);
    this.addSql(`create index \`transfer_destination_id_index\` on \`transfer\` (\`destination_id\`);`);
    this.addSql(`create unique index \`transfer_tenant_code_code_unique\` on \`transfer\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`transfer_posting\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`transfer_id\` text not null, \`kind\` text check (\`kind\` in ('dispatch', 'receipt', 'write-off')) not null, \`business_date\` text not null, \`occurred_at\` datetime not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`transit_before\` text not null, \`transit_after\` text not null, \`reason\` text not null, \`actor_user_id\` text null, \`actor_username\` text not null, \`channel\` text check (\`channel\` in ('ui', 'api')) not null, constraint \`transfer_posting_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`transfer_posting_transfer_id_foreign\` foreign key (\`transfer_id\`) references \`transfer\` (\`id\`));`);
    this.addSql(`create index \`transfer_posting_tenant_code_index\` on \`transfer_posting\` (\`tenant_code\`);`);
    this.addSql(`create index \`transfer_posting_transfer_id_index\` on \`transfer_posting\` (\`transfer_id\`);`);
    this.addSql(`create index \`transfer_posting_transfer_id_occurred_at_index\` on \`transfer_posting\` (\`transfer_id\`, \`occurred_at\`);`);
    this.addSql(`create trigger \`transfer_posting_no_update\` BEFORE UPDATE on \`transfer_posting\` for each ROW begin select raise(abort, 'Transfer postings are immutable'); end;`);
  }

  override down(): void | Promise<void> {

    // The postings first: they reference their transfers.
    this.addSql(`drop trigger if exists \`transfer_posting_no_update\`;`);
    this.addSql(`drop table if exists \`transfer_posting\`;`);
    this.addSql(`drop table if exists \`transfer\`;`);
  }

}
