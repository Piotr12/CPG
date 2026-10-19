import { Migration } from '@mikro-orm/migrations';

export class Migration20261019090456_user_preferences extends Migration {

  override name = 'Migration20261019090456_user_preferences';

  override up(): void | Promise<void> {
    this.addSql(`create table \`user_preference\` (\`id\` text not null primary key, \`user_id\` text not null, \`locale\` text check (\`locale\` in ('en', 'pl')) not null, \`theme\` text check (\`theme\` in ('light', 'dark')) not null, \`updated_at\` datetime not null, constraint \`user_preference_user_id_foreign\` foreign key (\`user_id\`) references \`user\` (\`id\`) on delete cascade);`);
    this.addSql(`create unique index \`user_preference_user_id_unique\` on \`user_preference\` (\`user_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`user_preference\`;`);
  }

}
