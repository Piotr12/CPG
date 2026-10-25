import { Migration } from '@mikro-orm/migrations';

export class Migration20261025120024_demand_review_indexes extends Migration {

  override name = 'Migration20261025120024_demand_review_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index \`stock_movement_tenant_code_type_business_date_index\` on \`stock_movement\` (\`tenant_code\`, \`type\`, \`business_date\`);`);

    this.addSql(`create index \`forecast_tenant_code_date_index\` on \`forecast\` (\`tenant_code\`, \`date\`);`);

    this.addSql(`create index \`customer_order_line_tenant_code_required_date_index\` on \`customer_order_line\` (\`tenant_code\`, \`required_date\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`customer_order_line_tenant_code_required_date_index\`;`);

    this.addSql(`drop index \`forecast_tenant_code_date_index\`;`);

    this.addSql(`drop index \`stock_movement_tenant_code_type_business_date_index\`;`);
  }

}
