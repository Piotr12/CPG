import { Migration } from '@mikro-orm/migrations';

export class Migration20261025080239_list_sort_indexes extends Migration {

  override name = 'Migration20261025080239_list_sort_indexes';

  override up(): void | Promise<void> {
    this.addSql(`create index \`purchase_requisition_tenant_code_required_date_code_index\` on \`purchase_requisition\` (\`tenant_code\`, \`required_date\`, \`code\`);`);
    this.addSql(`create index \`purchase_requisition_tenant_code_required_date_desc_code_index\` on \`purchase_requisition\` (\`tenant_code\`, \`required_date\` desc, \`code\`);`);
    this.addSql(`create index \`purchase_requisition_tenant_code_status_code_index\` on \`purchase_requisition\` (\`tenant_code\`, \`status\`, \`code\`);`);
    this.addSql(`create index \`purchase_requisition_tenant_code_status_desc_code_index\` on \`purchase_requisition\` (\`tenant_code\`, \`status\` desc, \`code\`);`);

    this.addSql(`create index \`purchase_order_tenant_code_status_code_index\` on \`purchase_order\` (\`tenant_code\`, \`status\`, \`code\`);`);
    this.addSql(`create index \`purchase_order_tenant_code_status_desc_code_index\` on \`purchase_order\` (\`tenant_code\`, \`status\` desc, \`code\`);`);

    this.addSql(`create index \`customer_order_tenant_code_status_code_index\` on \`customer_order\` (\`tenant_code\`, \`status\`, \`code\`);`);
    this.addSql(`create index \`customer_order_tenant_code_status_desc_code_index\` on \`customer_order\` (\`tenant_code\`, \`status\` desc, \`code\`);`);

    this.addSql(`create index \`production_order_tenant_code_planned_finish_code_index\` on \`production_order\` (\`tenant_code\`, \`planned_finish\`, \`code\`);`);
    this.addSql(`create index \`production_order_tenant_code_planned_finish_desc_code_index\` on \`production_order\` (\`tenant_code\`, \`planned_finish\` desc, \`code\`);`);
    this.addSql(`create index \`production_order_tenant_code_planned_start_code_index\` on \`production_order\` (\`tenant_code\`, \`planned_start\`, \`code\`);`);
    this.addSql(`create index \`production_order_tenant_code_planned_start_desc_code_index\` on \`production_order\` (\`tenant_code\`, \`planned_start\` desc, \`code\`);`);
    this.addSql(`create index \`production_order_tenant_code_status_code_index\` on \`production_order\` (\`tenant_code\`, \`status\`, \`code\`);`);
    this.addSql(`create index \`production_order_tenant_code_status_desc_code_index\` on \`production_order\` (\`tenant_code\`, \`status\` desc, \`code\`);`);

    this.addSql(`create index \`transfer_tenant_code_planned_dispatch_code_index\` on \`transfer\` (\`tenant_code\`, \`planned_dispatch\`, \`code\`);`);
    this.addSql(`create index \`transfer_tenant_code_planned_dispatch_desc_code_index\` on \`transfer\` (\`tenant_code\`, \`planned_dispatch\` desc, \`code\`);`);
    this.addSql(`create index \`transfer_tenant_code_status_code_index\` on \`transfer\` (\`tenant_code\`, \`status\`, \`code\`);`);
    this.addSql(`create index \`transfer_tenant_code_status_desc_code_index\` on \`transfer\` (\`tenant_code\`, \`status\` desc, \`code\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`customer_order_tenant_code_status_code_index\`;`);
    this.addSql(`drop index \`customer_order_tenant_code_status_desc_code_index\`;`);

    this.addSql(`drop index \`production_order_tenant_code_planned_finish_code_index\`;`);
    this.addSql(`drop index \`production_order_tenant_code_planned_finish_desc_code_index\`;`);
    this.addSql(`drop index \`production_order_tenant_code_planned_start_code_index\`;`);
    this.addSql(`drop index \`production_order_tenant_code_planned_start_desc_code_index\`;`);
    this.addSql(`drop index \`production_order_tenant_code_status_code_index\`;`);
    this.addSql(`drop index \`production_order_tenant_code_status_desc_code_index\`;`);

    this.addSql(`drop index \`purchase_order_tenant_code_status_code_index\`;`);
    this.addSql(`drop index \`purchase_order_tenant_code_status_desc_code_index\`;`);

    this.addSql(`drop index \`purchase_requisition_tenant_code_required_date_code_index\`;`);
    this.addSql(`drop index \`purchase_requisition_tenant_code_required_date_desc_code_index\`;`);
    this.addSql(`drop index \`purchase_requisition_tenant_code_status_code_index\`;`);
    this.addSql(`drop index \`purchase_requisition_tenant_code_status_desc_code_index\`;`);

    this.addSql(`drop index \`transfer_tenant_code_planned_dispatch_code_index\`;`);
    this.addSql(`drop index \`transfer_tenant_code_planned_dispatch_desc_code_index\`;`);
    this.addSql(`drop index \`transfer_tenant_code_status_code_index\`;`);
    this.addSql(`drop index \`transfer_tenant_code_status_desc_code_index\`;`);
  }

}
