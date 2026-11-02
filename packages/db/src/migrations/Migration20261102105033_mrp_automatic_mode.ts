import { Migration } from '@mikro-orm/migrations';

export class Migration20261102105033_mrp_automatic_mode extends Migration {

  override name = 'Migration20261102105033_mrp_automatic_mode';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`mrp_run\` add column \`creation\` json null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`mrp_run\` drop column \`creation\`;`);
  }

}
