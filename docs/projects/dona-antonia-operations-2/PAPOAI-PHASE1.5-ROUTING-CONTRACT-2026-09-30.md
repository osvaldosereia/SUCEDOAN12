# PapoAI Phase 1.5 — Routing Contract

**Date:** 2026-09-30
**Scope:** Supabase/GitHub side only. No outbound PapoAI send is enabled.

## Work findings incorporated

The authenticated PapoAI investigation found no safe sandbox that can execute the 0975/1018 WhatsApp automations without real delivery. The editor exposes no explicit inbound-channel filter, so implicit isolation remains unproven.

The inbound payload does expose enough identifiers for deterministic backend routing:
- `data.session.uid`;
- `data.session.agentbot_id`;
- `data.session.contact_id`;
- `data.contact.id`;
- message ids and external ids;
- message from/to phones;
- event metadata.

Observed channel mapping is consistent in production payloads:
- 0975 -> PapoAI agentbot id `2796` -> canonical `whatsapp_accounts` row `dona-antonia-0975`;
- 1018 -> PapoAI agentbot id `2501` -> canonical `whatsapp_accounts` row `dona-antonia-1018`.

## Architectural ruling

The backend, not the PapoAI text automation, is the authority for:
1. whether a site order requires registration;
2. which canonical customer/order/conversation is involved;
3. which WhatsApp account/channel produced the linked conversation;
4. whether an outbound registration Flow intent is eligible to exist.

PapoAI remains the delivery layer only after its outbound transport contract is verified.

## Route resolver

`ops2_papoai_route_context_v1(order_id)` resolves a route using:
1. exact `orders.conversation_id`, when already linked;
2. otherwise the latest webhook event already linked to the same canonical `customer_id` in the relevant time window.

It returns route availability plus the internal conversation/account and PapoAI session/contact/agentbot identifiers. It deliberately does not guess by arbitrary text or unverified cross-customer matching.

## Outbound intent ledger

`ops2_papoai_outbound_intents_v1` stores transport-neutral intents. Version 1 only supports `purpose='registration_flow'`.

Status values:
- `waiting_route`: registration is pending but no linked PapoAI session is available yet;
- `blocked_transport`: route exists, but PapoAI outbound transport has not been verified/enabled;
- `cancelled`, `sent`, `failed` are terminal/audit states for future transport work.

Each registration intent is idempotent on `order_id + registration transition sequence`.

`ops2_papoai_outbound_runtime_v1` is initialized with:
- `dispatch_enabled=false`;
- `transport_verified=false`.

No HTTP worker, cron, Flow send, template send or external PapoAI action exists in this phase.

## Baseline result

For the 16 current open registration journeys:
- 16 outbound registration intents were materialized;
- 10 already have a deterministic linked route and are `blocked_transport`;
- 6 are `waiting_route`;
- 0 are sent;
- 0 are failed.

Repeated planning of the same order keeps exactly one intent for the same transition sequence.

## Cancellation rule

When a registration journey is no longer pending/open, unsent registration intents for that order are cancelled by the planner invoked from the journey trigger. A future dispatcher must always re-resolve route immediately before a send attempt and must refuse to send when the journey is no longer open.

## Security

Runtime, intent table and RPCs are service-role only. RLS is enabled with explicit service-role policies, and execute/table privileges are revoked from `public`, `anon` and `authenticated`.

The Supabase security advisor remained on the same pre-existing 97 `RLS enabled no policy` findings; neither new table appears in that list.

## Next gate

Do not enable dispatch until the PapoAI supplier contract is verified for outbound delivery to a specific session/contact/channel. Once verified:
1. implement a dispatcher that re-resolves route immediately before sending;
2. test with a company-owned homologation number;
3. stop on the first cross-channel delivery;
4. only after successful routing tests set `transport_verified=true`;
5. keep `dispatch_enabled=false` until the final controlled cutover;
6. then add deterministic reminder stages and cancellation on registration completion.