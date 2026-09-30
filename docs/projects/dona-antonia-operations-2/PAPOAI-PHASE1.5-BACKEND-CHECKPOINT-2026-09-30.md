# PapoAI Phase 1.5 — Backend Checkpoint

**Date:** 2026-09-30
**Scope:** Supabase/GitHub only. PapoAI routing investigation remains owned by Work.

## What was implemented

### 1. Deterministic registration journey per site order

`ops2_customer_registration_journeys_v1` is a derived, service-only read model keyed by `order_id`.

It stores:
- `registration_state`: `pending` or `complete`;
- canonical `missing_fields`;
- `workflow_open` for non-terminal incomplete orders;
- `transition_seq`, incremented only on a real registration-state change;
- evaluation/transition timestamps;
- order status snapshot.

No outbound message, Flow, template, campaign or PapoAI action is performed by this table or its triggers.

### 2. Event-driven refresh

The backend now refreshes registration state automatically when relevant state changes:
- site order inserted or customer/status/source changed;
- customer name, CPF/CNPJ or primary WhatsApp changed;
- customer address inserted/deleted or customer/street/city/active state changed.

No cron or polling was added.

### 3. Canonical idempotent events

Real state transitions can emit into the existing `ops_events` ledger:
- `customer.registration_required`;
- `customer.registration_completed`;
- `customer.registration_reopened`.

The event idempotency key includes order, resulting state and transition sequence. Re-evaluating the same state does not increment the sequence and does not create a second event.

### 4. Silent baseline

Customer-linked site orders from the last 31 days were backfilled with `emit_event=false`. This establishes current derived state without manufacturing historical transition events.

Final baseline at verification time:
- recent site orders: 44;
- journeys created: 43;
- pending journeys: 16;
- complete journeys: 27;
- pending/open journeys: 16;
- one historical site order without customer remains outside the journey read model and remains a legacy exception.

### 5. Accurate PapoAI webhook health v3

A new read-only service RPC `get_papoai_webhook_health_v3()` was added instead of changing v2.

Reason: v2 labels both `captured` and `normalized` rows as `pending`. In the current adapter, `normalized` is the normal terminal state for ordinary messages; only special events such as Flow completions advance to `processed`.

The v3 separates:
- `raw_pending` (`captured` waiting for normalization);
- `normalized_terminal`;
- `processed_special`;
- `review_required`;
- events with error;
- linked/unlinked conversations in 24h;
- aggregate channel suffix counts;
- Flow metrics;
- registration summary;
- structured-order feature gates.

Verification snapshot:
- events total: 883;
- events in last 24h: 394;
- raw pending: 0;
- normalized terminal: 876;
- processed special: 7;
- review required: 0;
- events with error: 0;
- conversation linked in 24h: 394;
- conversation unlinked in 24h: 0;
- channel counts in 31d: 0975 = 699, 1018 = 184;
- Flow events: 7, review = 0;
- structured order commit remains disabled.

## TDD / verification evidence

RED:
- `ops2_refresh_order_registration_journey_v1(uuid,boolean)` did not exist before the migration and the pre-implementation call failed with PostgreSQL 42883.
- `get_papoai_webhook_health_v3()` did not exist before its migration and the pre-implementation call failed with PostgreSQL 42883.

GREEN:
- known incomplete order materialized as `pending`, workflow open, transition 1;
- known complete order materialized as `complete`, workflow closed, transition 1;
- silent backfill matched canonical counts: 16 pending + 27 complete = 43 customer-linked recent site orders;
- repeated same-state refresh created no event and no sequence increment;
- transactional synthetic lifecycle produced exactly one `registration_required` and one `registration_completed`, final sequence 2;
- redundant address update did not create another event;
- transaction ended with `ROLLBACK` and residue checks returned zero customer/order/journey/event rows.

## Security

Journey table:
- RLS enabled;
- explicit service-role-only policy;
- `public`, `anon`, `authenticated` table privileges revoked;
- service role has required table privileges.

RPCs:
- `SECURITY DEFINER` with explicit empty search path;
- `anon` execute: false;
- `authenticated` execute: false;
- service role execute: true.

Supabase security advisor remained at the same pre-existing 97 `RLS enabled no policy` findings; the new journey table is not one of them because it has an explicit policy. Leaked-password protection remains a pre-existing Auth warning outside this work.

## PapoAI invariants preserved

- Flow events remain 7 total, 0 review;
- `papoai_order_drafts_v2` remains empty;
- no `orders.source='papoai'` order was created;
- `structured_order_commit_enabled=false`;
- no PapoAI outbound send was implemented;
- no reminder schedule was implemented;
- no COMPROU automation was re-enabled;
- no marketing, post-sale, campaign or funil action was enabled.

## Deliberately deferred

No outbound outbox/dispatcher was created yet. Work is investigating whether PapoAI has a safe native mechanism to select the originating channel/conversation for Flow/template delivery. The backend must not commit to a dispatcher contract before that result is known.

When Work returns Phase 1.5 findings, the next design gate is:
1. resolve 0975/1018 routing deterministically;
2. define outbound intent/outbox contract;
3. use `workflow_open` + idempotency for Flow and reminder scheduling;
4. cancel pending actions on `customer.registration_completed`;
5. only then perform controlled end-to-end messaging tests.
