import { Migration } from '@mikro-orm/migrations';

export class Migration20261019110502_audit_events extends Migration {

  override name = 'Migration20261019110502_audit_events';

  override up(): void | Promise<void> {
    this.addSql(`create table \`global_audit_event\` (\`id\` text not null primary key, \`occurred_at\` datetime not null, \`action\` text not null, \`subject_type\` text not null, \`subject_id\` text not null, \`subject_label\` text not null, \`before\` json null, \`after\` json null, \`actor_user_id\` text not null, \`actor_username\` text not null, \`session_id\` text null, \`channel\` text check (\`channel\` in ('ui', 'api')) not null, \`token_id\` text null, \`token_name\` text null);`);
    this.addSql(`create index \`global_audit_event_occurred_at_index\` on \`global_audit_event\` (\`occurred_at\`);`);
    this.addSql(`create trigger \`global_audit_event_no_update\` BEFORE UPDATE on \`global_audit_event\` for each ROW begin select raise(abort, 'audit is append-only'); end;`);
    this.addSql(`create trigger \`global_audit_event_no_delete\` BEFORE DELETE on \`global_audit_event\` for each ROW begin select raise(abort, 'audit is append-only'); end;`);

    this.addSql(`create table \`tenant_audit_event\` (\`id\` text not null primary key, \`occurred_at\` datetime not null, \`action\` text not null, \`subject_type\` text not null, \`subject_id\` text not null, \`subject_label\` text not null, \`before\` json null, \`after\` json null, \`actor_user_id\` text not null, \`actor_username\` text not null, \`session_id\` text null, \`channel\` text check (\`channel\` in ('ui', 'api')) not null, \`token_id\` text null, \`token_name\` text null, \`tenant_code\` text not null, constraint \`tenant_audit_event_tenant_code_foreign\` foreign key (\`tenant_code\`) references \`tenant\` (\`code\`));`);
    this.addSql(`create index \`tenant_audit_event_tenant_code_index\` on \`tenant_audit_event\` (\`tenant_code\`);`);
    this.addSql(`create index \`tenant_audit_event_tenant_code_occurred_at_index\` on \`tenant_audit_event\` (\`tenant_code\`, \`occurred_at\`);`);
    this.addSql(`create trigger \`tenant_audit_event_no_update\` BEFORE UPDATE on \`tenant_audit_event\` for each ROW begin select raise(abort, 'audit is append-only'); end;`);
    this.addSql(`create trigger \`tenant_audit_event_no_delete\` BEFORE DELETE on \`tenant_audit_event\` for each ROW begin select raise(abort, 'audit is append-only'); end;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists \`global_audit_event_no_update\`;`);
    this.addSql(`drop trigger if exists \`global_audit_event_no_delete\`;`);
    this.addSql(`drop table if exists \`global_audit_event\`;`);
    this.addSql(`drop trigger if exists \`tenant_audit_event_no_update\`;`);
    this.addSql(`drop trigger if exists \`tenant_audit_event_no_delete\`;`);
    this.addSql(`drop table if exists \`tenant_audit_event\`;`);
  }

}
