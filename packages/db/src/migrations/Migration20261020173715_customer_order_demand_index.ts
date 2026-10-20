import { Migration } from '@mikro-orm/migrations';

export class Migration20261020173715_customer_order_demand_index extends Migration {

  override name = 'Migration20261020173715_customer_order_demand_index';

  override up(): void | Promise<void> {
    this.addSql(`create index \`customer_order_line_tenant_code_material_id_removed_status_id_index\` on \`customer_order_line\` (\`tenant_code\`, \`material_id\`, \`removed\`, \`status\`, \`id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`customer_order_line_tenant_code_material_id_removed_status_id_index\`;`);
  }

}
