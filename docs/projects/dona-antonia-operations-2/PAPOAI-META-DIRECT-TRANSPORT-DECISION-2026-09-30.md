# PapoAI / Meta Direct Transport Decision

**Date:** 2026-09-30

## Decision

Deterministic operational outbound messaging will not depend on an undocumented PapoAI outbound transport contract.

Target architecture:

- PapoAI: inbound conversation, AI assistance, current registration Flow UX while useful, and conversation context.
- Supabase: source of truth for customer registration state, order state, route resolution, idempotent outbound intents, cancellation and audit.
- Meta WhatsApp Cloud API: preferred deterministic outbound transport once homologated.
- Make: historical evidence / recovery source only; not a production runtime dependency for this flow.

## Evidence recovered

Historical Make execution `5eb1d2c721324160a70924f36a73d5a3` on 2026-09-11 performed a direct Meta Graph POST to:

`/v26.0/1218939807961094/messages`

with a WhatsApp Flow interactive payload and received HTTP 200 plus a Meta `wamid`.

That sender is mapped to the canonical 1018 WhatsApp account.

Historical Meta Flow admin probes also showed WABA `840102181903253`, Business `1055822571753443` and App `1547249776748513`, with Meta Flow messaging availability at the time of those probes.

The historical GitHub implementation of `whatsapp-meta-direct-v1` proves the project previously used the standard Meta Graph `/messages` contract and expected these environment variables:

- `META_WHATSAPP_ACCESS_TOKEN`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_VERSION`

No secret values are stored in this document.

## 0975 status

The 0975 account is canonical as `+5565998150975` and PapoAI agentbot `2796`, but its Meta `phone_number_id` is not yet proven. An old Make connection named `998150975` exists but cannot currently resolve dynamic sender IDs and must not be treated as evidence of a specific `phone_number_id`.

Do not guess or copy the 1018 sender ID to 0975.

## New guarded transport pieces

`ops2_meta_whatsapp_senders_v1` stores verified/evidenced sender IDs separately from PapoAI routing metadata.

1018 is recorded with historical sender ID `1218939807961094`, but intentionally remains:

- `is_verified=false`
- `is_send_enabled=false`

`ops2_meta_whatsapp_flow_bindings_v1` stores Flow IDs by account and purpose. It is currently empty for `registration_flow` because no current registration Flow ID has yet been proven for direct Meta sending.

`ops2_meta_dispatch_readiness_v1(intent_id)` combines route, sender, Flow and fail-closed guard readiness without sending.

The reused Edge Function slot `whatsapp-meta-direct-v1` now contains a minimal outbound-only dispatcher. It:

1. requires JWT;
2. accepts only an `intent_id` and optional `dry_run`;
3. defaults to dry-run;
4. calls the database readiness/guard contract;
5. supports only `registration_flow`;
6. resolves sender and Flow bindings from service-only tables;
7. only reaches Meta Graph when every DB gate is explicitly enabled;
8. records `wamid`/transport evidence on successful future sends.

It does not implement inbound handling, customer creation, address collection, order routing, menus or AI. Those responsibilities from the historical function were deliberately not restored.

## Current fail-closed state

- `dispatch_mode=disabled`
- `dispatch_enabled=false`
- `transport_verified=false`
- homologation allowlist is empty
- 1018 sender is not verified/enabled
- 0975 sender is absent
- registration Flow bindings are absent
- sent outbound intents = 0

Therefore no live Meta outbound send can currently pass the guard/readiness chain.

## Required homologation facts

Before any live test:

1. confirm current Meta `phone_number_id` for 0975 and 1018 in Meta Business Manager / WhatsApp Manager;
2. identify the exact published registration Flow ID usable by each sender, or create a controlled Meta-owned equivalent;
3. confirm `META_WHATSAPP_ACCESS_TOKEN` is still present/valid without exposing it;
4. add only a company-owned test number to the homologation allowlist;
5. verify sender/Flow bindings but keep production disabled;
6. perform one controlled send per channel;
7. prove that completion returns to the expected inbound path and updates the canonical customer/order journey;
8. only then consider production enablement and deterministic reminders.

## Additional pre-production hardening

Before production dispatch, add an atomic send claim (`sending`/lease semantics) so concurrent invocations cannot double-send the same idempotent intent. This is not a current risk because dispatch is fully disabled.
