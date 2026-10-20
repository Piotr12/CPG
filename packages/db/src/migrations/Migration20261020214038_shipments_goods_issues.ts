import { Migration } from '@mikro-orm/migrations';

export class Migration20261020214038_shipments_goods_issues extends Migration {

  override name = 'Migration20261020214038_shipments_goods_issues';

  override up(): void | Promise<void> {
    this.addSql(`create table \`shipment\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`order_id\` text not null, \`planned_date\` text not null, \`status\` text check (\`status\` in ('open', 'completed')) not null default 'open', \`created_at\` datetime not null, constraint \`shipment_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`shipment_order_id_foreign\` foreign key (\`order_id\`) references \`customer_order\` (\`id\`));`);
    this.addSql(`create index \`shipment_tenant_code_index\` on \`shipment\` (\`tenant_code\`);`);
    this.addSql(`create index \`shipment_order_id_index\` on \`shipment\` (\`order_id\`);`);
    this.addSql(`create unique index \`shipment_tenant_code_code_unique\` on \`shipment\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`goods_issue\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`shipment_id\` text not null, \`business_date\` text not null, \`created_at\` datetime not null, constraint \`goods_issue_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`goods_issue_shipment_id_foreign\` foreign key (\`shipment_id\`) references \`shipment\` (\`id\`));`);
    this.addSql(`create index \`goods_issue_tenant_code_index\` on \`goods_issue\` (\`tenant_code\`);`);
    this.addSql(`create index \`goods_issue_shipment_id_index\` on \`goods_issue\` (\`shipment_id\`);`);
    this.addSql(`create unique index \`goods_issue_tenant_code_code_unique\` on \`goods_issue\` (\`tenant_code\`, \`code\`);`);
    this.addSql(`create trigger \`goods_issue_no_update\` BEFORE UPDATE on \`goods_issue\` for each ROW begin select raise(abort, 'Goods issues are immutable'); end;`);

    this.addSql(`create table \`shipment_line\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`shipment_id\` text not null, \`position\` integer not null, \`order_line_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, \`issued\` text not null default '0.000000', constraint \`shipment_line_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`shipment_line_shipment_id_foreign\` foreign key (\`shipment_id\`) references \`shipment\` (\`id\`), constraint \`shipment_line_order_line_id_foreign\` foreign key (\`order_line_id\`) references \`customer_order_line\` (\`id\`));`);
    this.addSql(`create index \`shipment_line_tenant_code_index\` on \`shipment_line\` (\`tenant_code\`);`);
    this.addSql(`create index \`shipment_line_shipment_id_index\` on \`shipment_line\` (\`shipment_id\`);`);
    this.addSql(`create index \`shipment_line_order_line_id_index\` on \`shipment_line\` (\`order_line_id\`);`);
    this.addSql(`create unique index \`shipment_line_shipment_id_position_unique\` on \`shipment_line\` (\`shipment_id\`, \`position\`);`);

    this.addSql(`create table \`goods_issue_line\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`issue_id\` text not null, \`position\` integer not null, \`shipment_line_id\` text not null, \`quantity\` text not null, \`entered_quantity\` text not null, \`entered_unit\` text not null, \`numerator\` text not null, \`denominator\` text not null, constraint \`goods_issue_line_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`), constraint \`goods_issue_line_issue_id_foreign\` foreign key (\`issue_id\`) references \`goods_issue\` (\`id\`), constraint \`goods_issue_line_shipment_line_id_foreign\` foreign key (\`shipment_line_id\`) references \`shipment_line\` (\`id\`));`);
    this.addSql(`create index \`goods_issue_line_tenant_code_index\` on \`goods_issue_line\` (\`tenant_code\`);`);
    this.addSql(`create index \`goods_issue_line_issue_id_index\` on \`goods_issue_line\` (\`issue_id\`);`);
    this.addSql(`create index \`goods_issue_line_shipment_line_id_index\` on \`goods_issue_line\` (\`shipment_line_id\`);`);
    this.addSql(`create unique index \`goods_issue_line_issue_id_position_unique\` on \`goods_issue_line\` (\`issue_id\`, \`position\`);`);
    this.addSql(`create trigger \`goods_issue_line_no_update\` BEFORE UPDATE on \`goods_issue_line\` for each ROW begin select raise(abort, 'Goods issues are immutable'); end;`);
  }

  override down(): void | Promise<void> {

    // Children first: issue lines reference issues and shipment lines, which reference shipments.
    this.addSql(`drop trigger if exists \`goods_issue_line_no_update\`;`);
    this.addSql(`drop table if exists \`goods_issue_line\`;`);
    this.addSql(`drop trigger if exists \`goods_issue_no_update\`;`);
    this.addSql(`drop table if exists \`goods_issue\`;`);
    this.addSql(`drop table if exists \`shipment_line\`;`);
    this.addSql(`drop table if exists \`shipment\`;`);
  }

}
