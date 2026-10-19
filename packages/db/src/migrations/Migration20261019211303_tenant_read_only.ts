import { Migration } from '@mikro-orm/migrations';

export class Migration20261019211303_tenant_read_only extends Migration {

  override name = 'Migration20261019211303_tenant_read_only';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`tenant\` add column \`read_only\` integer not null default false;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`tenant\` drop column \`read_only\`;`);
  }

}
