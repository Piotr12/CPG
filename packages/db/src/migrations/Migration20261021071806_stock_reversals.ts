import { Migration } from '@mikro-orm/migrations';

export class Migration20261021071806_stock_reversals extends Migration {

  override name = 'Migration20261021071806_stock_reversals';

  override up(): void | Promise<void> {
    this.addSql(`create table \`stock_reversal\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`original_id\` text not null, \`inverse_id\` text not null, constraint \`stock_reversal_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`stock_reversal_original_id_foreign\` foreign key (\`original_id\`) references \`stock_movement\` (\`id\`), constraint \`stock_reversal_inverse_id_foreign\` foreign key (\`inverse_id\`) references \`stock_movement\` (\`id\`));`);
    this.addSql(`create index \`stock_reversal_tenant_code_index\` on \`stock_reversal\` (\`tenant_code\`);`);
    this.addSql(`create index \`stock_reversal_original_id_index\` on \`stock_reversal\` (\`original_id\`);`);
    this.addSql(`create index \`stock_reversal_inverse_id_index\` on \`stock_reversal\` (\`inverse_id\`);`);
    this.addSql(`create unique index \`stock_reversal_tenant_code_original_id_unique\` on \`stock_reversal\` (\`tenant_code\`, \`original_id\`);`);
    this.addSql(`create unique index \`stock_reversal_tenant_code_inverse_id_unique\` on \`stock_reversal\` (\`tenant_code\`, \`inverse_id\`);`);
    this.addSql(`create trigger \`stock_reversal_no_update\` BEFORE UPDATE on \`stock_reversal\` for each ROW begin select raise(abort, 'Stock reversal links are immutable'); end;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists \`stock_reversal_no_update\`;`);
    this.addSql(`drop table if exists \`stock_reversal\`;`);
  }

}
