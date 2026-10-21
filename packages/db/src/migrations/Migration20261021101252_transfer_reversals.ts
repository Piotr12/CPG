import { Migration } from '@mikro-orm/migrations';

export class Migration20261021101252_transfer_reversals extends Migration {

  override name = 'Migration20261021101252_transfer_reversals';

  override up(): void | Promise<void> {
    this.addSql(`create table \`transfer_reversal\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`transfer_id\` text not null, \`original_id\` text not null, \`business_date\` text not null, \`occurred_at\` datetime not null, \`quantity\` text not null, \`transit_before\` text not null, \`transit_after\` text not null, \`reason\` text not null, \`actor_user_id\` text null, \`actor_username\` text not null, \`channel\` text check (\`channel\` in ('ui', 'api')) not null, constraint \`transfer_reversal_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`transfer_reversal_transfer_id_foreign\` foreign key (\`transfer_id\`) references \`transfer\` (\`id\`), constraint \`transfer_reversal_original_id_foreign\` foreign key (\`original_id\`) references \`transfer_posting\` (\`id\`));`);
    this.addSql(`create index \`transfer_reversal_tenant_code_index\` on \`transfer_reversal\` (\`tenant_code\`);`);
    this.addSql(`create index \`transfer_reversal_transfer_id_index\` on \`transfer_reversal\` (\`transfer_id\`);`);
    this.addSql(`create index \`transfer_reversal_original_id_index\` on \`transfer_reversal\` (\`original_id\`);`);
    this.addSql(`create index \`transfer_reversal_transfer_id_occurred_at_index\` on \`transfer_reversal\` (\`transfer_id\`, \`occurred_at\`);`);
    this.addSql(`create unique index \`transfer_reversal_tenant_code_original_id_unique\` on \`transfer_reversal\` (\`tenant_code\`, \`original_id\`);`);
    this.addSql(`create trigger \`transfer_reversal_no_update\` BEFORE UPDATE on \`transfer_reversal\` for each ROW begin select raise(abort, 'Transfer reversals are immutable'); end;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists \`transfer_reversal_no_update\`;`);
    this.addSql(`drop table if exists \`transfer_reversal\`;`);
  }

}
