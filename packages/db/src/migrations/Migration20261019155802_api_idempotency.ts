import { Migration } from '@mikro-orm/migrations';

export class Migration20261019155802_api_idempotency extends Migration {

  override name = 'Migration20261019155802_api_idempotency';

  override up(): void | Promise<void> {
    this.addSql(`create table \`global_idempotency_key\` (\`id\` text not null primary key, \`user_id\` text not null, \`key\` text not null, \`operation\` text not null, \`fingerprint\` text not null, \`response\` json null, \`created_at\` datetime not null);`);
    this.addSql(`create index \`global_idempotency_key_created_at_index\` on \`global_idempotency_key\` (\`created_at\`);`);
    this.addSql(`create unique index \`global_idempotency_key_user_id_key_unique\` on \`global_idempotency_key\` (\`user_id\`, \`key\`);`);

    this.addSql(`create table \`tenant_idempotency_key\` (\`id\` text not null primary key, \`user_id\` text not null, \`key\` text not null, \`operation\` text not null, \`fingerprint\` text not null, \`response\` json null, \`created_at\` datetime not null, \`tenant_code\` text not null, \`generation\` integer not null, constraint \`tenant_idempotency_key_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`));`);
    this.addSql(`create index \`tenant_idempotency_key_tenant_code_index\` on \`tenant_idempotency_key\` (\`tenant_code\`);`);
    this.addSql(`create index \`tenant_idempotency_key_tenant_code_created_at_index\` on \`tenant_idempotency_key\` (\`tenant_code\`, \`created_at\`);`);
    this.addSql(`create unique index \`tenant_idempotency_key_tenant_code_user_id_key_unique\` on \`tenant_idempotency_key\` (\`tenant_code\`, \`user_id\`, \`key\`);`);

    this.addSql(`alter table \`user\` add column \`version\` integer not null default 1;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`global_idempotency_key\`;`);
    this.addSql(`drop table if exists \`tenant_idempotency_key\`;`);

    this.addSql(`alter table \`user\` drop column \`version\`;`);
  }

}
