-- Post-review regression; use a NEW disposable PostgreSQL CI database only.
\set ON_ERROR_STOP on

DO $old_acl$
DECLARE num_bad int;
BEGIN
 SELECT count(*) INTO num_bad
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (
  has_table_privilege('anon',c.oid,'TRUNCATE')
  OR has_table_privilege('authenticated',c.oid,'TRUNCATE')
  OR has_table_privilege('anon',c.oid,'TRIGGER')
  OR has_table_privilege('authenticated',c.oid,'TRIGGER')
  OR has_table_privilege('anon',c.oid,'REFERENCES')
  OR has_table_privilege('authenticated',c.oid,'REFERENCES')
  OR has_table_privilege('anon',c.oid,'MAINTAIN')
  OR has_table_privilege('authenticated',c.oid,'MAINTAIN')
 );
 IF num_bad<>0 THEN RAISE EXCEPTION 'unsafe legacy privileges remain: %',num_bad; END IF;
 IF NOT has_table_privilege('authenticated','public.dispatch_fiscal_jobs','SELECT')
   OR NOT has_table_privilege('authenticated','public.ops_events','INSERT')
   OR NOT has_table_privilege('anon','public.ops_events','SELECT')
   OR NOT has_table_privilege('service_role','public.dispatch_fiscal_jobs','SELECT')
 THEN RAISE EXCEPTION 'essential application permissions accidentally revoked'; END IF;
END $old_acl$;

CREATE TABLE public.future_postgres_after_hardening(id bigint PRIMARY KEY);
SET ROLE supabase_admin;
CREATE TABLE public.future_admin_after_hardening(id bigint PRIMARY KEY);
RESET ROLE;

DO $future_acl$
DECLARE bad text[];
BEGIN
 SELECT array_agg(c.relname ORDER BY c.relname) INTO bad
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
  AND c.relname IN ('future_postgres_after_hardening','future_admin_after_hardening')
  AND (has_table_privilege('anon',c.oid,'TRUNCATE') OR
       has_table_privilege('authenticated',c.oid,'TRUNCATE') OR
       has_table_privilege('anon',c.oid,'REFERENCES') OR
       has_table_privilege('authenticated',c.oid,'REFERENCES') OR
       has_table_privilege('anon',c.oid,'TRIGGER') OR
       has_table_privilege('authenticated',c.oid,'TRIGGER') OR
       has_table_privilege('anon',c.oid,'MAINTAIN') OR
       has_table_privilege('authenticated',c.oid,'MAINTAIN'));
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'unsafe default privileges on new tables: %',bad; END IF;
END $future_acl$;

-- Validating idempotent replay makes the contract safe to reapply in an
-- isolated migration staging environment. This SQL is NOT deployed.
SELECT 'PASS: TRUNCATE/TRIGGER/REFERENCES/MAINTAIN restricted, normal access preserved, dangerous defaults disabled' result;
