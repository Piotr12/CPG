import { Migration } from '@mikro-orm/migrations';

export class Migration20261020193728_goods_receipts extends Migration {

  override name = 'Migration20261020193728_goods_receipts';

  override up(): void | Promise<void> {
    this.addSql(`create table \`goods_receipt\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`order_id\` text not null, \`business_date\` text not null, \`created_at\` datetime not null, constraint \`goods_receipt_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`goods_receipt_order_id_foreign\` foreign key (\`order_id\`) references \`purchase_order\` (\`id\`));`);
    this.addSql(`create index \`goods_receipt_tenant_code_index\` on \`goods_receipt\` (\`tenant_code\`);`);
    this.addSql(`create index \`goods_receipt_order_id_index\` on \`goods_receipt\` (\`order_id\`);`);
    this.addSql(`create unique index \`goods_receipt_tenant_code_code_unique\` on \`goods_receipt\` (\`tenant_code\`, \`code\`);`);
    this.addSql(`create trigger \`goods_receipt_no_update\` BEFORE UPDATE on \`goods_receipt\` for each ROW begin select raise(abort, 'Goods receipts are immutable'); end;`);

    this.addSql(`create table \`goods_receipt_line\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`receipt_id\` text not null, \`position\` integer not null, \`order_line_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, constraint \`goods_receipt_line_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`goods_receipt_line_receipt_id_foreign\` foreign key (\`receipt_id\`) references \`goods_receipt\` (\`id\`), constraint \`goods_receipt_line_order_line_id_foreign\` foreign key (\`order_line_id\`) references \`purchase_order_line\` (\`id\`));`);
    this.addSql(`create index \`goods_receipt_line_tenant_code_index\` on \`goods_receipt_line\` (\`tenant_code\`);`);
    this.addSql(`create index \`goods_receipt_line_receipt_id_index\` on \`goods_receipt_line\` (\`receipt_id\`);`);
    this.addSql(`create index \`goods_receipt_line_order_line_id_index\` on \`goods_receipt_line\` (\`order_line_id\`);`);
    this.addSql(`create unique index \`goods_receipt_line_receipt_id_position_unique\` on \`goods_receipt_line\` (\`receipt_id\`, \`position\`);`);
    this.addSql(`create trigger \`goods_receipt_line_no_update\` BEFORE UPDATE on \`goods_receipt_line\` for each ROW begin select raise(abort, 'Goods receipts are immutable'); end;`);

    this.addSql(`alter table \`purchase_order_line\` add column \`received\` text not null default '0.000000';`);
  }

  override down(): void | Promise<void> {

    // Lines first: they reference the receipts.
    this.addSql(`drop trigger if exists \`goods_receipt_line_no_update\`;`);
    this.addSql(`drop table if exists \`goods_receipt_line\`;`);
    this.addSql(`drop trigger if exists \`goods_receipt_no_update\`;`);
    this.addSql(`drop table if exists \`goods_receipt\`;`);

    this.addSql(`alter table \`purchase_order_line\` drop column \`received\`;`);
  }

}
