import { Migration } from '@mikro-orm/migrations';

export class Migration20261021095627_audit_record_index extends Migration {

  override name = 'Migration20261021095627_audit_record_index';

  override up(): void | Promise<void> {
    this.addSql(`create index \`global_audit_event_subject_type_subject_id_occurred_at_id_index\` on \`global_audit_event\` (\`subject_type\`, \`subject_id\`, \`occurred_at\`, \`id\`);`);

    this.addSql(`create index \`tenant_audit_event_tenant_code_subject_type_subject_id_occurred_at_id_index\` on \`tenant_audit_event\` (\`tenant_code\`, \`subject_type\`, \`subject_id\`, \`occurred_at\`, \`id\`);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index \`global_audit_event_subject_type_subject_id_occurred_at_id_index\`;`);

    this.addSql(`drop index \`tenant_audit_event_tenant_code_subject_type_subject_id_occurred_at_id_index\`;`);
  }

}
