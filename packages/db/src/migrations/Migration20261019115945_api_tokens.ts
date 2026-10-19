import { Migration } from '@mikro-orm/migrations';

export class Migration20261019115945_api_tokens extends Migration {

  override name = 'Migration20261019115945_api_tokens';

  override up(): void | Promise<void> {
    this.addSql(`create table \`api_token\` (\`id\` text not null primary key, \`user_id\` text not null, \`name\` text not null, \`token_hash\` text not null, \`created_at\` datetime not null, \`last_used_at\` datetime null, constraint \`api_token_user_id_foreign\` foreign key (\`user_id\`) references \`user\` (\`id\`) on delete cascade);`);
    this.addSql(`create index \`api_token_user_id_index\` on \`api_token\` (\`user_id\`);`);
    this.addSql(`create unique index \`api_token_token_hash_unique\` on \`api_token\` (\`token_hash\`);`);
    this.addSql(`create unique index \`api_token_user_id_name_unique\` on \`api_token\` (\`user_id\`, \`name\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`api_token\`;`);
  }

}
