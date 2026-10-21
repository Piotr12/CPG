import { Migration } from '@mikro-orm/migrations';

export class Migration20261021075527_shipment_order_cursor extends Migration {

  override name = 'Migration20261021075527_shipment_order_cursor';

  override up(): void | Promise<void> {
    this.addSql(`create index \`shipment_tenant_code_order_id_code_index\` on \`shipment\` (\`tenant_code\`, \`order_id\`, \`code\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`shipment_tenant_code_order_id_code_index\`;`);
  }

}
