import { Migration } from '@mikro-orm/migrations';

export class Migration20261101075151_mrp_acceptance extends Migration {

  override name = 'Migration20261101075151_mrp_acceptance';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`mrp_recommendation\` add column \`accepted_document\` text null;`);

    this.addSql(`alter table \`purchase_requisition\` add column \`mrp_run\` text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`mrp_recommendation\` drop column \`accepted_document\`;`);

    this.addSql(`alter table \`purchase_requisition\` drop column \`mrp_run\`;`);
  }

}
