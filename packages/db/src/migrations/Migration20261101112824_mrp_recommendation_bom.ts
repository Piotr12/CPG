import { Migration } from '@mikro-orm/migrations';

export class Migration20261101112824_mrp_recommendation_bom extends Migration {

  override name = 'Migration20261101112824_mrp_recommendation_bom';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`mrp_recommendation\` add column \`bom\` text null;`);
    this.addSql(`alter table \`mrp_recommendation\` add column \`bom_revision\` integer null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`mrp_recommendation\` drop column \`bom\`;`);
    this.addSql(`alter table \`mrp_recommendation\` drop column \`bom_revision\`;`);
  }

}
