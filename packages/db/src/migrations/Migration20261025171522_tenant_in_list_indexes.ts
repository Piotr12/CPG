import { Migration } from '@mikro-orm/migrations';

export class Migration20261025171522_tenant_in_list_indexes extends Migration {

  override name = 'Migration20261025171522_tenant_in_list_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index \`purchase_order_line_tenant_code_order_id_index\` on \`purchase_order_line\` (\`tenant_code\`, \`order_id\`);`);

    this.addSql(`create index \`goods_receipt_line_tenant_code_receipt_id_index\` on \`goods_receipt_line\` (\`tenant_code\`, \`receipt_id\`);`);
    this.addSql(`create index \`goods_receipt_line_tenant_code_order_line_id_index\` on \`goods_receipt_line\` (\`tenant_code\`, \`order_line_id\`);`);

    this.addSql(`create index \`customer_order_line_tenant_code_order_id_index\` on \`customer_order_line\` (\`tenant_code\`, \`order_id\`);`);

    this.addSql(`create index \`shipment_line_tenant_code_shipment_id_index\` on \`shipment_line\` (\`tenant_code\`, \`shipment_id\`);`);

    this.addSql(`create index \`goods_issue_line_tenant_code_issue_id_index\` on \`goods_issue_line\` (\`tenant_code\`, \`issue_id\`);`);
    this.addSql(`create index \`goods_issue_line_tenant_code_shipment_line_id_index\` on \`goods_issue_line\` (\`tenant_code\`, \`shipment_line_id\`);`);

    this.addSql(`create index \`production_order_tenant_code_id_index\` on \`production_order\` (\`tenant_code\`, \`id\`);`);

    this.addSql(`create index \`production_completion_line_tenant_code_completion_id_index\` on \`production_completion_line\` (\`tenant_code\`, \`completion_id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`customer_order_line_tenant_code_order_id_index\`;`);

    this.addSql(`drop index \`goods_issue_line_tenant_code_issue_id_index\`;`);
    this.addSql(`drop index \`goods_issue_line_tenant_code_shipment_line_id_index\`;`);

    this.addSql(`drop index \`goods_receipt_line_tenant_code_receipt_id_index\`;`);
    this.addSql(`drop index \`goods_receipt_line_tenant_code_order_line_id_index\`;`);

    this.addSql(`drop index \`production_completion_line_tenant_code_completion_id_index\`;`);

    this.addSql(`drop index \`production_order_tenant_code_id_index\`;`);

    this.addSql(`drop index \`purchase_order_line_tenant_code_order_id_index\`;`);

    this.addSql(`drop index \`shipment_line_tenant_code_shipment_id_index\`;`);
  }

}
