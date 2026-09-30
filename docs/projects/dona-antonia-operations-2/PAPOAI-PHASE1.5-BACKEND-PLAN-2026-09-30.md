# PapoAI Phase 1.5 — Backend deterministic registration state

Date: 2026-09-30
Scope: Supabase/GitHub only. No PapoAI outbound send.

## Goal
Persist a derived registration journey per site order, driven by real order/customer/address changes, using the canonical readiness RPC created in Phase 1.

## Rules
- Supabase remains source of truth.
- No message, Flow, template, campaign or PapoAI action is sent from this phase.
- No conversational order commit is enabled.
- No cron/polling: refresh is event-driven through DB triggers.
- Repeated evaluation of the same state must not create duplicate events.
- Existing recent orders are backfilled silently (no fake historical events).
- Terminal orders remain visible but are not action-eligible.
- PapoAI routing/outbox waits for Work Phase 1.5 findings.

## Deliverables
1. `ops2_customer_registration_journeys_v1` read-model table, one row per site order.
2. `ops2_refresh_order_registration_journey_v1(order_id, emit_event)`.
3. `ops2_refresh_customer_registration_journeys_v1(customer_id, emit_event)`.
4. Event-driven triggers on orders, customers and customer_addresses.
5. Canonical idempotent ops events on real state transitions:
   - `customer.registration_required`
   - `customer.registration_completed`
   - `customer.registration_reopened`
6. Silent 31-day backfill for existing site orders with customer linkage.
7. Aggregate metrics added to `ops2_customer_registration_summary_v1`.

## State model
- `pending`: canonical `registration_complete=false`.
- `complete`: canonical `registration_complete=true`.
- `workflow_open`: false for delivered/cancelled/returned orders, otherwise true only while pending.
- `transition_seq`: increments only when registration state changes.
- `missing_fields`: copied from canonical readiness state.

## TDD gates
- RED: table/function do not exist.
- GREEN: one known incomplete order becomes pending, one known complete order becomes complete.
- Idempotency: repeated refresh creates no second event and does not increment transition_seq.
- Backfill: row counts agree with canonical state for customer-linked site orders in the 31-day window.
- Security: anon/authenticated cannot access table/RPCs; service_role can.
- Invariants: Flow counts unchanged, drafts=0, PapoAI orders=0, structured_order_commit_enabled=false.
