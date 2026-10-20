import { Migration } from '@mikro-orm/migrations';

export class Migration20261020164640_test_reset extends Migration {

  override name = 'Migration20261020164640_test_reset';

  override up(): void | Promise<void> {
    this.addSql(`drop trigger if exists \`tenant_audit_event_no_delete\`;`);
    this.addSql(`create trigger \`tenant_audit_event_no_delete\` BEFORE DELETE on \`tenant_audit_event\` for each ROW
  when old.tenant_code <> 'test' begin select raise(abort, 'audit is append-only'); end;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop trigger if exists \`tenant_audit_event_no_delete\`;`);
    this.addSql(`create trigger \`tenant_audit_event_no_delete\` BEFORE DELETE on \`tenant_audit_event\` for each ROW begin select raise(abort, 'audit is append-only'); end;`);
  }

}
