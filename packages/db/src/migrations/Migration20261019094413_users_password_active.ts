import { Migration } from '@mikro-orm/migrations';

export class Migration20261019094413_users_password_active extends Migration {

  override name = 'Migration20261019094413_users_password_active';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`user\` add column \`password_hash\` text null;`);
    this.addSql(`alter table \`user\` add column \`active\` integer not null default true;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`user\` drop column \`password_hash\`;`);
    this.addSql(`alter table \`user\` drop column \`active\`;`);
  }

}
