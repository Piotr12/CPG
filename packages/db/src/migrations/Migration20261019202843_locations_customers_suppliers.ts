import { Migration } from '@mikro-orm/migrations';

export class Migration20261019202843_locations_customers_suppliers extends Migration {

  override name = 'Migration20261019202843_locations_customers_suppliers';

  override up(): void | Promise<void> {
    this.addSql(`create table \`supplier\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`name\` text not null, \`active\` integer not null default true, \`created_at\` datetime not null, \`version\` integer not null default 1, constraint \`supplier_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`));`);
    this.addSql(`create index \`supplier_tenant_code_index\` on \`supplier\` (\`tenant_code\`);`);
    this.addSql(`create unique index \`supplier_tenant_code_code_unique\` on \`supplier\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`location\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`name\` text not null, \`active\` integer not null default true, \`created_at\` datetime not null, \`version\` integer not null default 1, constraint \`location_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`));`);
    this.addSql(`create index \`location_tenant_code_index\` on \`location\` (\`tenant_code\`);`);
    this.addSql(`create unique index \`location_tenant_code_code_unique\` on \`location\` (\`tenant_code\`, \`code\`);`);

    this.addSql(`create table \`customer\` (\`id\` text not null primary key, \`tenant_code\` text not null, \`code\` text not null, \`name\` text not null, \`active\` integer not null default true, \`created_at\` datetime not null, \`version\` integer not null default 1, constraint \`customer_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`));`);
    this.addSql(`create index \`customer_tenant_code_index\` on \`customer\` (\`tenant_code\`);`);
    this.addSql(`create unique index \`customer_tenant_code_code_unique\` on \`customer\` (\`tenant_code\`, \`code\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists \`supplier\`;`);
    this.addSql(`drop table if exists \`location\`;`);
    this.addSql(`drop table if exists \`customer\`;`);
  }

}
