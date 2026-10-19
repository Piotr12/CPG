import { Migration } from '@mikro-orm/migrations';

export class Migration20261019092708_tenants extends Migration {

  override name = 'Migration20261019092708_tenants';

  override up(): void | Promise<void> {
    this.addSql(`create table \`tenant\` (\`code\` text check (\`code\` in ('test', 'prod')) not null primary key, \`generation\` integer not null default 1);`);
    // Both tenants exist from the first start (TEN-001); nothing creates them at runtime.
    this.addSql(`insert into \`tenant\` (\`code\`, \`generation\`) values ('test', 1), ('prod', 1);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`tenant\`;`);
  }

}
