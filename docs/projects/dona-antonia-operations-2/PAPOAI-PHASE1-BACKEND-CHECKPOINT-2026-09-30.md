# PapoAI Phase 1 — Backend Checkpoint

**Date:** 2026-09-30
**Scope:** Supabase/GitHub side only. PapoAI panel changes remain owned by Work.

## Production state

Phase 1 established a canonical, derived customer registration/readiness contract in the canonical Supabase project `ssbesxgaijknwsjbsbcz`.

### Canonical readiness

`ops2_customer_registration_state_v1(p_customer_id uuid)` now defines three independent states:

- `identity_ready`: customer exists with nonblank name and canonical Brazilian WhatsApp phone.
- `registration_complete`: `identity_ready` plus valid CPF/CNPJ and at least one active address with nonblank street and city.
- `bling_ready`: true when the customer is already linked to a positive `bling_contact_id`, or when `registration_complete=true` for a new Bling contact.

`missing_fields` is deterministic and uses only: `name`, `phone`, `document`, `address`, `city`.

The RPC returns no customer PII other than the customer UUID supplied as input.

### Aggregate observability

`ops2_customer_registration_summary_v1(p_days integer default 31)` exposes aggregate counts only.

Verification snapshot for 31 days immediately after deployment:

- recent site orders: 43;
- site orders with incomplete registration: 16;
- distinct customers with incomplete registration: 13;
- distinct customers registration-complete: 15;
- distinct customers Bling-ready but not linked: 4;
- Flow events in window: 7;
- Flow events requiring review: 0.

No names, phones, CPF/CNPJ, addresses, streets or customer UUID lists are returned by the aggregate RPC.

## Verification performed

TDD/production-safe verification covered:

1. name + canonical phone, without document/address -> identity ready only;
2. valid name/phone/CPF plus active street/city -> registration and Bling ready;
3. invalid CPF/CNPJ -> registration incomplete;
4. inactive address does not satisfy completion;
5. active address without city reports `city` missing;
6. positive existing `bling_contact_id` remains `bling_ready=true` without reimposing create-only requirements;
7. unknown customer fails closed.

Synthetic customer/address tests ran inside a transaction followed by `ROLLBACK`. Final residue check: 0 synthetic customers and 0 synthetic addresses.

## Security

Both RPCs:

- are `SECURITY DEFINER` with explicit empty `search_path`;
- revoke execute from `public`, `anon`, and `authenticated`;
- grant execute only to `service_role`.

Verified:

- `anon` execute: false;
- `authenticated` execute: false;
- `service_role` execute: true.

Supabase security advisor produced no new finding attributable to these RPCs. Pre-existing project advisories remain, chiefly RLS-enabled tables without explicit policies and leaked-password protection disabled in Auth; they are outside this Phase 1 scope.

## PapoAI invariants preserved

- Existing Flow parser/mapping was not changed.
- Existing Flow events remain: 7 total, 0 review.
- `papoai_order_drafts_v2` remains at 0 records.
- No `orders.source='papoai'` order was created by this phase.
- `structured_order_commit_enabled` remains `false`.
- No Flow completion automatically creates a Bling contact/job in this phase.
- Storefront WhatsApp handoff text remains unchanged; `CLIENTE: NOVO` / `CLIENTE: CADASTRADO` cutover is intentionally deferred.

## Coordination with Work

Work is responsible for the PapoAI-panel side of Phase 1:

- isolate registration automation 0975/1018 by channel if supported safely;
- correct `confirmacaodeendereco1018` name mapping;
- disable the generic `PEDIDO -> COMPROU` automation;
- resolve the indefinite AI pause risk on 1018;
- align timezone when safe;
- preserve the main inbound Supabase webhook and current Flow fields.

## Next gate

Do not start Phase 2 until Work returns its Phase 1 execution report. Then compare:

1. channel isolation and PapoAI configuration state;
2. live Supabase readiness metrics;
3. Flow reception on both channels;
4. whether storefront messaging can safely move from existence-based `CLIENTE: CADASTRADO/NOVO` to canonical registration-state signaling.

Only after this cross-check should deterministic Flow reminders, order confirmation/cancellation, conversational drafts, post-sale, or marketing automation be enabled.
