-- Security hardening proposal, NOT a production migration.
-- Verified on 2026-10-09 by read-only Supabase introspection:
-- 29 public tables grant TRUNCATE to anon/authenticated; some also grant
-- TRIGGER / REFERENCES / MAINTAIN. These privileges can harm integrity boundaries.
--
-- This contract intentionally does not touch SELECT/INSERT/UPDATE/DELETE,
-- ownership, RLS policies, service_role or application RPC EXECUTE.
-- DO NOT execute this file on production until role owner/ACL and service
-- operations are reviewed and the PR's PostgreSQL 17 tests pass.
-- Use Supabase CLI migration new after approval to create a real migration.

DO $revoke_dangerous_table_acl$
DECLARE obj record;
BEGIN
  FOR obj IN
    SELECT n.nspname AS schema_name,c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind IN ('r','p')
      AND (
        has_table_privilege('anon',c.oid,'TRUNCATE')
        OR has_table_privilege('authenticated',c.oid,'TRUNCATE')
        OR has_table_privilege('anon',c.oid,'TRIGGER')
        OR has_table_privilege('authenticated',c.oid,'TRIGGER')
        OR has_table_privilege('anon',c.oid,'REFERENCES')
        OR has_table_privilege('authenticated',c.oid,'REFERENCES')
        OR has_table_privilege('anon',c.oid,'MAINTAIN')
        OR has_table_privilege('authenticated',c.oid,'MAINTAIN')
      )
    ORDER BY n.nspname,c.relname
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLE %I.%I FROM anon, authenticated',
      obj.schema_name,obj.table_name);
  END LOOP;
END $revoke_dangerous_table_acl$;

-- Prevent recurrence for tables created by the two observed owners.
-- These ALTERs require the issuing owner (or a sufficiently privileged role);
-- validate ownership and role availability before production deployment.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON TABLES FROM anon, authenticated;

-- Refuse to pass if existing grants still expose unsafe operations. Using
-- has_table_privilege also detects effective permissions, not only direct ACL.
DO $assert_no_unsafe_acl$
DECLARE remaining integer;
BEGIN
 SELECT count(*) INTO remaining
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
   AND (
    has_table_privilege('anon',c.oid,'TRUNCATE')
    OR has_table_privilege('authenticated',c.oid,'TRUNCATE')
    OR has_table_privilege('anon',c.oid,'TRIGGER')
    OR has_table_privilege('authenticated',c.oid,'TRIGGER')
    OR has_table_privilege('anon',c.oid,'REFERENCES')
    OR has_table_privilege('authenticated',c.oid,'REFERENCES')
        OR has_table_privilege('anon',c.oid,'MAINTAIN')
        OR has_table_privilege('authenticated',c.oid,'MAINTAIN')
   );
 IF remaining<>0 THEN
   RAISE EXCEPTION 'unsafe_public_table_privileges_remain_%',remaining;
 END IF;
END $assert_no_unsafe_acl$;
