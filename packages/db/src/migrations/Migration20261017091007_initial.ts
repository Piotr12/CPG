import { Migration } from '@mikro-orm/migrations';

export class Migration20261017091007_initial extends Migration {

  override name = 'Migration20261017091007_initial';

  override up(): void | Promise<void> {
    this.addSql(`create table \`setting\` (\`key\` text not null primary key, \`value\` text not null, \`updated_at\` datetime not null);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`setting\`;`);
  }

}
