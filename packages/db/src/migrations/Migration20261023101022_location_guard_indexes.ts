import { Migration } from '@mikro-orm/migrations';

export class Migration20261023101022_location_guard_indexes extends Migration {

  override name = 'Migration20261023101022_location_guard_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index \`purchase_requisition_tenant_code_location_id_status_code_index\` on \`purchase_requisition\` (\`tenant_code\`, \`location_id\`, \`status\`, \`code\`);`);

    this.addSql(`create index \`purchase_order_tenant_code_location_id_status_code_index\` on \`purchase_order\` (\`tenant_code\`, \`location_id\`, \`status\`, \`code\`);`);

    this.addSql(`create index \`customer_order_tenant_code_location_id_status_code_index\` on \`customer_order\` (\`tenant_code\`, \`location_id\`, \`status\`, \`code\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`customer_order_tenant_code_location_id_status_code_index\`;`);

    this.addSql(`drop index \`purchase_order_tenant_code_location_id_status_code_index\`;`);

    this.addSql(`drop index \`purchase_requisition_tenant_code_location_id_status_code_index\`;`);
  }

}
