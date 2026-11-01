import { Migration } from '@mikro-orm/migrations';

export class Migration20261101075645_mrp_recommendation_lead_time extends Migration {

  override name = 'Migration20261101075645_mrp_recommendation_lead_time';

  override up(): void | Promise<void> {
    this.addSql(`alter table \`mrp_recommendation\` add column \`lead_time_days\` integer not null default 0;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table \`mrp_recommendation\` drop column \`lead_time_days\`;`);
  }

}
