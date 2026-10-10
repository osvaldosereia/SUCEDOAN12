# Marketing Security Hardening Plan

> Inline execution through the existing GitHub review and Supabase project.

**Goal:** Harden legacy marketing state and opt-out audit storage while preserving server-side operation.

**Architecture:** Enable RLS on the two legacy public tables, revoke direct access from public API roles, and retain service-role access. Remove default PUBLIC execution from their SECURITY DEFINER routines; retain service-role execution only for internal recalculation and send-recording functions.

**Tech Stack:** Supabase PostgreSQL, SQL migration, Node contract test, GitHub Actions.

**Spec:** Continue preparing safe marketing automation after PapoAI is disabled.

## Tasks

1. Add a contract test for RLS, least-privilege table grants, and SECURITY DEFINER function execution.
2. Run the test red, add an idempotent SQL migration, and run it green.
3. Add the test to WhatsApp Meta CI.
4. Dry-run with post-change privilege assertions, merge after CI, apply in production, and verify final security state and runtime flags.

## Review Focus

- Trigger functions must continue through existing database triggers after direct RPC execution is revoked.
- service_role must retain server access.
- No anon or authenticated policy or grant should expose these tables.
