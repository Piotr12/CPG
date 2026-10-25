import { Migration } from '@mikro-orm/migrations';

export class Migration20261025180850_list_key_read_indexes extends Migration {

  override name = 'Migration20261025180850_list_key_read_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index \`goods_receipt_tenant_code_id_index\` on \`goods_receipt\` (\`tenant_code\`, \`id\`);`);

    this.addSql(`create index \`goods_issue_tenant_code_id_index\` on \`goods_issue\` (\`tenant_code\`, \`id\`);`);

    this.addSql(`create index \`shipment_line_tenant_code_order_line_id_index\` on \`shipment_line\` (\`tenant_code\`, \`order_line_id\`);`);

    this.addSql(`create index \`production_completion_tenant_code_id_index\` on \`production_completion\` (\`tenant_code\`, \`id\`);`);

    this.addSql(`create index \`transfer_posting_tenant_code_id_index\` on \`transfer_posting\` (\`tenant_code\`, \`id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`goods_issue_tenant_code_id_index\`;`);

    this.addSql(`drop index \`goods_receipt_tenant_code_id_index\`;`);

    this.addSql(`drop index \`production_completion_tenant_code_id_index\`;`);

    this.addSql(`drop index \`shipment_line_tenant_code_order_line_id_index\`;`);

    this.addSql(`drop index \`transfer_posting_tenant_code_id_index\`;`);
  }

}
