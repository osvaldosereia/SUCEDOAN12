# Atendimento Conversation Identity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate open conversations for the same WhatsApp account and contact, show the selected conversation's phone, and consolidate the proven duplicate without losing linked history or state.

**Architecture:** Add a database migration that serializes conversation resolution with a transaction-scoped advisory lock and consolidates only unambiguous existing duplicate groups. Change the attendance context UI to use the current conversation phone already returned by the context RPC. Keep the different phone linked to the same customer as a separate conversation.

**Tech Stack:** Supabase PostgreSQL, SQL migrations, JavaScript ES modules, GitHub branch workflow.

**Spec:** `docs/superpowers/specs/2026-10-05-attendance-conversation-identity-race-design.md`

## Global Constraints

- Identity key is the WhatsApp account plus the canonical contact phone.
- Never consolidate different phones, different accounts, conflicting customer links, or invalid phone identities.
- The resolver remains `SECURITY DEFINER`, keeps the same signature and `service_role`-only execution grant.
- Preserve message history and every existing conversation foreign-key reference before deleting a duplicate row.
- The Meta transport, webhook, PapoAI behavior, client/customer records, and API response formats are out of scope.
- Do not apply the migration to production or publish the UI during implementation; prepare a reviewed branch only.
- Do not add or run tests in this task; use read-only data consistency checks and inspect the complete diff.

## Review Focus

- Same account + same valid phone + no existing conversation: concurrent resolution must serialize before the lookup and second insert.
- Same account + same phone but conflicting `customer_id` values: consolidation must skip the entire group.
- Same customer + different phone: retain separate conversations and customer-identity phone values.
- Duplicate message or label/state references: consolidate without losing rows or violating unique keys.
- Null/invalid canonical phone: leave the conversation unchanged and do not accidentally group unrelated contacts.

---

### Task 1: Lock conversation resolution and consolidate eligible duplicates

**Files:**
- Create: generated `supabase/migrations/<timestamp>_attendance_conversation_identity_race_v1.sql`
- Create: matching `supabase/sql/<timestamp>_attendance_conversation_identity_race_v1.sql`

**Interfaces:**
- Consumes: `public.whatsapp_resolve_conversation_v1(uuid,text,uuid,text)`, `public.canonical_whatsapp_e164_br_v2(text)`, `public.conversations`, and its foreign-key dependents.
- Produces: unchanged resolver signature/return contract with serialization; one-time idempotent consolidation of eligible open duplicate groups.

- [ ] **Step 1: Generate the migration file**

Run from the repository checkout: `supabase migration new attendance_conversation_identity_race_v1`.

Expected: a timestamped migration path under `supabase/migrations/`; use that exact timestamp for the reference copy under `supabase/sql/`.

- [ ] **Step 2: Replace the resolver body without changing its interface**

Keep `p_whatsapp_account_id uuid, p_phone_e164 text, p_customer_id uuid default null, p_source text default 'unknown'`, its `jsonb` result, `SECURITY DEFINER`, empty search path, and existing ACL. After validating the account and non-empty phone, set `v_phone := coalesce(public.canonical_whatsapp_e164_br_v2(v_phone),v_phone)`; then acquire `pg_advisory_xact_lock(hashtextextended('whatsapp-conversation:'||p_whatsapp_account_id::text||':'||v_phone,0))` before the lookup. Use this same `v_phone` for lookup, insertion, and return. Unrecognized phone values retain their existing string and behavior.

- [ ] **Step 3: Consolidate only eligible duplicate groups in the same migration transaction**

Identify open rows by account + valid canonical phone. Process a group only if every row in that account/phone group has the same `customer_id` (including all-null as one group); leave conflicting or invalid groups untouched. Choose the keeper by message count descending, latest activity descending, then conversation UUID ascending.

Move dependent references to the keeper before deleting duplicate conversation rows. Handle collisions explicitly:
  - Merge attendance labels with `ON CONFLICT DO NOTHING`, then remove duplicate label links.
  - Merge `attendance_conversation_state_v1` by greatest `last_read_at` with its matching message ID; preserve the follow-up from the row with greatest `updated_at`, including null cancellation; then remove duplicate state rows.
  - Reassign `whatsapp_messages_v1`, `attendance_human_ai_audit_v1`, `attendance_library_audit_v1`, `carts`, `catalog_sessions`, `customer_profile_extraction_runs_v1`, `customer_profile_suggestions_v1`, `ops2_papoai_outbound_intents_v1`, `ops2_whatsapp_outbox_v1`, `orders`, `papoai_customer_flow_events_v1`, `storefront_identity_tokens`, `whatsapp_ana_jobs_v1`, and `whatsapp_ana_reviews_v1`. Reassign `whatsapp_outbox_v1` as well, respecting `ON DELETE SET NULL` semantics by moving it before deletion.
  - Merge `last_inbound_at`, `last_outbound_at`, `service_window_expires_at`, and `updated_at` with greatest values. Use the row with latest `updated_at` for current `status`, `mode`, and `stage`; set `human_required` true if either row requires it.
  - Before deleting each duplicate, assert no foreign-key row remains attached to it; any collision or failed assertion aborts the migration.

The data routine must be idempotent: after eligible groups are consolidated, running it again makes no conversation changes. Do not hardcode production row UUIDs or phone numbers in the migration.

- [ ] **Step 4: Create the reference SQL copy**

Copy the exact migration contents to `supabase/sql/<same timestamp>_attendance_conversation_identity_race_v1.sql`.

Expected: both SQL files are byte-for-byte identical.

- [ ] **Step 5: Review migration safety and commit**

Inspect the SQL for transaction boundaries, candidate-group predicates, function ACL, every declared conversation foreign key, conflict handling, and the final no-reference assertion. Commit the migration and reference SQL together.

---

### Task 2: Show the selected conversation's contact phone

**Files:**
- Modify: `vitrine/admin/atendimento/attendance-app.js`

**Interfaces:**
- Consumes: `state.conversation.conversation.phone_e164` returned by `ops2_admin_attendance_context_v1`.
- Produces: customer card subtitle sourced from the selected conversation.

- [ ] **Step 1: Use conversation identity in the customer overview**

In `renderOverview(box)`, set the displayed WhatsApp subtitle from `state.conversation?.conversation?.phone_e164`. When missing, render the existing empty/unknown state; never substitute `state.context.customer.phone_e164`. Keep customer name, masked document, address, purchase totals, consent, and customer actions unchanged.

- [ ] **Step 2: Inspect the focused UI diff**

Confirm only the customer phone source and its empty fallback changed; the context RPC and customer record remain untouched. Commit this UI change separately from the database migration.

---

### Task 3: Final branch review and handoff

**Files:**
- Review: the migration, reference SQL, and `attendance-app.js`.

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: reviewable branch and explicit production-approval checkpoint.

- [ ] **Step 1: Run read-only consistency checks against the current database before any production migration**

Capture counts for eligible duplicate groups, conflicting-customer groups, messages, and all foreign-key dependents. The current proven duplicate group is expected to contain one message in the duplicate row and a later read state in the keeper; the other phone must remain a separate identity.

- [ ] **Step 2: Review the complete branch diff**

Verify the migration lock is acquired before the resolver lookup, consolidation excludes conflicts/invalid phones, the separate phone is never coalesced, and the UI displays the selected conversation phone.

- [ ] **Step 3: Stop before production application**

Present the branch and read-only review results. Applying the migration to production or publishing the UI requires the user's explicit approval after review.
