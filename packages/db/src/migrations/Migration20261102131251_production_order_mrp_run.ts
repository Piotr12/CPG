import { Migration } from '@mikro-orm/migrations';

export class Migration20261102131251_production_order_mrp_run extends Migration {

  override name = 'Migration20261102131251_production_order_mrp_run';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`production_order\` add column \`mrp_run\` text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`production_order\` drop column \`mrp_run\`;`);
  }

}
