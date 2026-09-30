# PapoAI Phase 1 Registration State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one canonical, service-role-only customer registration/readiness contract and aggregate observability in Supabase, without changing live PapoAI Flow parsing, storefront handoff text, or enabling conversational order creation.

**Architecture:** Implement two derived RPCs over existing canonical tables/functions: `ops2_customer_registration_state_v1(uuid)` for one customer and `ops2_customer_registration_summary_v1(integer)` for aggregate health. Reuse `canonical_whatsapp_e164_br_v2` and `ops2_valid_cpf_cnpj_v1`; select a usable active address from `customer_addresses`; persist no readiness flags. Version the production SQL in `supabase/sql/` and update continuity docs after verification.

**Tech Stack:** PostgreSQL/PLpgSQL on Supabase, GitHub repository `osvaldosereia/SUCEDOAN12`.

**Spec:** `docs/superpowers/specs/2026-09-30-papoai-phase1-registration-state-design.md`

## Global Constraints

- Canonical Supabase project: `ssbesxgaijknwsjbsbcz`.
- Do not change PapoAI automations from this repository.
- Do not change the live `CLIENTE: NOVO` / `CLIENTE: CADASTRADO` handoff text in Phase 1.
- Preserve Flow mapping `custom_1=bairro`, `custom_2=cidade`, `custom_3=CPF/CNPJ`, `custom_4=endereço`, `custom_5=nome`.
- Keep `structured_order_commit_enabled=false`.
- Do not create customers, orders, messages, Bling jobs or Bling contacts as a side effect of readiness calls.
- Do not infer/merge identities by approximate name or phone.
- RPCs must be unavailable to `public`, `anon`, and `authenticated`; only `service_role` may execute them.
- Aggregate summary must return counts only, with no names, phones, documents or addresses.

## Review Focus

- Customer has name and valid phone but no document/address: identity ready only, not registration/Bling ready.
- Customer has a malformed CPF/CNPJ: must remain incomplete even if all other fields exist.
- Customer has several addresses: any active address with nonblank street and city is sufficient; inactive addresses do not count.
- Customer already has positive `bling_contact_id`: `bling_ready=true` even if create-only fields are now incomplete.
- Unknown customer ID: fail closed with no PII and all readiness flags false.

---

### Task 1: Canonical registration-state RPC

**Files:**
- Create: `supabase/sql/20260930_ops2_customer_registration_state_v1.sql`
- Modify in production through Supabase migration: functions only; no table/data mutation.

**Interfaces:**
- Consumes: `public.customers`, `public.customer_addresses`, `public.canonical_whatsapp_e164_br_v2(text)`, `public.ops2_valid_cpf_cnpj_v1(text)`.
- Produces: `public.ops2_customer_registration_state_v1(p_customer_id uuid) returns jsonb`.

- [ ] **Step 1: Write/run the red test for missing interface**

Run a read-only existence assertion before migration:

```sql
select to_regprocedure('public.ops2_customer_registration_state_v1(uuid)') is not null as exists;
```

Expected: `false`.

- [ ] **Step 2: Implement `ops2_customer_registration_state_v1(uuid) -> jsonb` in the canonical SQL file**

Implementation decisions:
- fetch one row from `customers` by exact UUID;
- canonicalize `primary_whatsapp_e164` using `canonical_whatsapp_e164_br_v2`;
- `identity_ready = nonblank name AND canonical phone is not null`;
- `document` is valid only through `ops2_valid_cpf_cnpj_v1`;
- address availability comes only from `customer_addresses` rows where `customer_id` matches, `is_active=true`, `street` is nonblank, and `city` is nonblank; prefer default/newest only for internal selection, but readiness is existential;
- `registration_complete = identity_ready AND valid document AND usable address`;
- `already_linked_bling = bling_contact_id > 0`;
- `bling_ready = already_linked_bling OR registration_complete`;
- `missing_fields` order is exactly `name`, `phone`, `document`, `address`, `city`, adding only applicable missing values; distinguish `address` and `city` by inspecting whether any active address has each component;
- unknown customer returns `ok=false`, `error='customer_not_found'`, flags false, `already_linked_bling=false`, and minimum missing fields without exposing other data;
- use `SECURITY DEFINER`, explicit `SET search_path TO ''`, fully-qualified object names;
- revoke all from `public`, `anon`, `authenticated`; grant execute only to `service_role`.

- [ ] **Step 3: Apply migration to canonical Supabase**

Use migration name `ops2_customer_registration_state_v1` with exactly the SQL versioned in `supabase/sql/20260930_ops2_customer_registration_state_v1.sql`.

Expected: migration success; no DML against production customers/orders.

- [ ] **Step 4: Run green tests in one transaction and roll back synthetic rows**

Create synthetic customers/addresses inside `BEGIN ... ROLLBACK` and assert:

1. name + valid phone, no doc/address → `identity_ready=true`, `registration_complete=false`, `bling_ready=false`;
2. valid name/phone/CPF + active street/city → all three ready=true;
3. invalid CPF with otherwise complete data → registration/Bling false and `document` missing;
4. only inactive complete address → registration false;
5. active address with street but blank city → missing `city` and registration false;
6. positive synthetic `bling_contact_id` with missing create-only fields → `bling_ready=true`, `already_linked_bling=true`;
7. random nonexistent UUID → `ok=false`, error `customer_not_found`.

Expected: all assertions pass and final synthetic residue count is zero.

- [ ] **Step 5: Verify permissions and runtime gate**

Run:

```sql
select
  has_function_privilege('anon','public.ops2_customer_registration_state_v1(uuid)','EXECUTE') as anon_exec,
  has_function_privilege('authenticated','public.ops2_customer_registration_state_v1(uuid)','EXECUTE') as auth_exec,
  has_function_privilege('service_role','public.ops2_customer_registration_state_v1(uuid)','EXECUTE') as service_exec,
  (select structured_order_commit_enabled from public.ops2_papoai_bridge_runtime_v1 where id=1) as order_commit_enabled;
```

Expected: `anon_exec=false`, `auth_exec=false`, `service_exec=true`, `order_commit_enabled=false`.

- [ ] **Step 6: Commit canonical SQL**

Commit only the SQL file for this task with message:

`feat: add canonical customer registration state`

---

### Task 2: Aggregate registration observability RPC

**Files:**
- Modify: `supabase/sql/20260930_ops2_customer_registration_state_v1.sql`

**Interfaces:**
- Consumes: `ops2_customer_registration_state_v1(uuid)`, `orders`, `papoai_customer_flow_events_v1`.
- Produces: `public.ops2_customer_registration_summary_v1(p_days integer default 31) returns jsonb`.

- [ ] **Step 1: Write/run the red test for missing summary interface**

Before adding the summary function:

```sql
select to_regprocedure('public.ops2_customer_registration_summary_v1(integer)') is not null as exists;
```

Expected: `false`.

- [ ] **Step 2: Implement `ops2_customer_registration_summary_v1(integer) -> jsonb`**

Pinned behavior:
- clamp `p_days` to 1..365, default 31;
- window uses `now() - make_interval(days => clamped_days)`;
- site sources are `vitrine` and `storefront_v2`;
- counts: `recent_site_orders`, `recent_site_orders_incomplete_registration`, `distinct_customers_incomplete_registration`, `distinct_customers_registration_complete`, `distinct_customers_bling_ready_unlinked`, `flow_events_total`, `flow_events_review`;
- only aggregate numbers plus `generated_at` and `days` may be returned;
- no arrays/objects containing customer UUIDs or PII;
- same internal permission posture as Task 1.

- [ ] **Step 3: Apply an additive migration revision**

Apply only the summary function addition/replacement, preserving Task 1 function behavior. Use migration name `ops2_customer_registration_summary_v1`.

- [ ] **Step 4: Verify aggregate behavior against production read-only counts**

Call `ops2_customer_registration_summary_v1(31)` as privileged context and verify:
- all required keys exist;
- all count values are nonnegative integers;
- serialized result contains none of the keys `name`, `phone`, `cpf`, `cnpj`, `address`, `street`, `customer_id`;
- the current seven historical Flow events remain present overall and no Flow rows changed;
- `structured_order_commit_enabled` remains false.

- [ ] **Step 5: Verify summary permissions**

Expected: `anon=false`, `authenticated=false`, `service_role=true` for the summary function.

- [ ] **Step 6: Update the canonical SQL file and commit**

The final `supabase/sql/20260930_ops2_customer_registration_state_v1.sql` contains both functions and all revoke/grant statements in deployment order.

Commit message:

`feat: add customer registration readiness summary`

---

### Task 3: Production verification and continuity documentation

**Files:**
- Modify: `docs/projects/dona-antonia-operations-2/HANDOFF.md`

**Interfaces:**
- Consumes: both RPCs from Tasks 1–2 and current PapoAI runtime state.
- Produces: documented Phase 1 backend checkpoint for Work coordination.

- [ ] **Step 1: Run fresh production verification**

Verify in one read-only query/report:
- both functions exist;
- both are inaccessible to anon/authenticated and executable by service_role;
- `structured_order_commit_enabled=false`;
- Flow parser objects and the seven existing Flow events were not modified;
- no new `papoai_order_drafts_v2` or `orders source='papoai'` were created by this phase;
- no synthetic test customer/address remains.

- [ ] **Step 2: Run Supabase security advisor**

Expected: no new warning attributable to either Phase 1 function. Pre-existing project-wide RLS/password warnings may remain and must be reported as pre-existing rather than claimed fixed.

- [ ] **Step 3: Update `HANDOFF.md`**

Append a dated section recording:
- canonical readiness contract now exists;
- exact meanings of `identity_ready`, `registration_complete`, `bling_ready`;
- storefront text cutover is intentionally deferred until Work reports channel isolation/stability;
- Flow mapping unchanged;
- order commit still disabled;
- next coordination step is compare Work’s Phase 1 PapoAI report with Supabase readiness metrics before Phase 2.

- [ ] **Step 4: Commit documentation**

Commit message:

`docs: record PapoAI phase 1 backend checkpoint`

- [ ] **Step 5: Final verification before completion claim**

Re-run the acceptance checklist from the spec and report exact evidence/counts. Do not claim the phase complete if any test, permission, advisor, or no-residue check fails.
