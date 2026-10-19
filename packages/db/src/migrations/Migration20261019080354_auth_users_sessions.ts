import { Migration } from '@mikro-orm/migrations';

export class Migration20261019080354_auth_users_sessions extends Migration {

  override name = 'Migration20261019080354_auth_users_sessions';

  override up(): void | Promise<void> {
    this.addSql(`create table \`user\` (\`id\` text not null primary key, \`username\` text not null, \`role\` text check (\`role\` in ('admin', 'user')) not null, \`created_at\` datetime not null);`);
    this.addSql(`create unique index \`user_username_unique\` on \`user\` (\`username\`);`);

    this.addSql(`create table \`session\` (\`id\` text not null primary key, \`token_hash\` text not null, \`user_id\` text not null, \`created_at\` datetime not null, \`expires_at\` datetime not null, constraint \`session_user_id_foreign\` foreign key (\`user_id\`) references \`user\` (\`id\`) on delete cascade);`);
    this.addSql(`create unique index \`session_token_hash_unique\` on \`session\` (\`token_hash\`);`);
    this.addSql(`create index \`session_user_id_index\` on \`session\` (\`user_id\`);`);
    this.addSql(`create index \`session_expires_at_index\` on \`session\` (\`expires_at\`);`);
  }

  override down(): void | Promise<void> {

    // Sessions first: they reference users.
    this.addSql(`drop table if exists \`session\`;`);
    this.addSql(`drop table if exists \`user\`;`);
  }

}
