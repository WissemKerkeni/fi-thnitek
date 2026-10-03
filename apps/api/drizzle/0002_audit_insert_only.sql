-- audit.audit_logs is insert-only (CLAUDE.md rule 5).
-- 1) A trigger blocks UPDATE, DELETE and TRUNCATE for every role, including the table owner.
CREATE FUNCTION audit.reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_logs is insert-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit.audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit.audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
--> statement-breakpoint
-- 2) A dedicated role with INSERT and SELECT only, for a future least-privilege connection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fi_audit_writer') THEN
    CREATE ROLE fi_audit_writer NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL ON audit.audit_logs FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA audit TO fi_audit_writer;
--> statement-breakpoint
GRANT INSERT, SELECT ON audit.audit_logs TO fi_audit_writer;
