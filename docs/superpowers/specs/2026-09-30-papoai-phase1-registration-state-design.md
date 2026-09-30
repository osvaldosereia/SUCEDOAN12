# PapoAI Phase 1 — Registration State Contract Design

**Date:** 2026-09-30
**Scope:** Supabase/GitHub side only. PapoAI panel changes are executed separately in Work.

## Goal

Create one deterministic customer-registration contract that can be consumed consistently by Storefront, Admin, PapoAI and the Bling integration, without changing the current live Flow mapping or enabling conversational order creation.

## Context

The current Storefront treats any resolved customer as `CADASTRADO`, even when the record is provisional or incomplete. The PapoAI audit confirmed that Flow sending is currently triggered by text markers such as `CLIENTE: NOVO` / `Alterar Cadastro`, while real Flow responses already reach Supabase and are processed correctly on both WhatsApp channels.

The system must stop equating “customer exists” with “registration complete”.

## Architecture

Introduce a single service-role-only registration-state function in Supabase. It evaluates a customer deterministically and returns three independent readiness states:

- `identity_ready`: sufficient identity to own/display a site order.
- `registration_complete`: sufficient data to skip the registration Flow.
- `bling_ready`: sufficient data to create a new Bling contact safely.

All three states are derived from canonical customer data. No UI, PapoAI automation or Bling integration may independently invent its own definition once the cutover is completed.

## Canonical rules

### 1. identity_ready

`true` only when:
- customer exists;
- customer has a non-empty name;
- a canonical Brazilian WhatsApp phone can be resolved.

This is the minimum state required for a normal new Storefront order.

### 2. registration_complete

`true` only when all of the following are present and valid:
- `identity_ready=true`;
- valid CPF/CNPJ according to `ops2_valid_cpf_cnpj_v1`;
- one usable customer address containing at minimum street/address text and city.

Neighborhood is desirable but must not independently block completion when the remaining address is usable. State defaults to Mato Grosso when the existing Flow/address pipeline already applies that rule; this phase does not invent missing address data.

### 3. bling_ready

For a customer without `bling_contact_id`, `true` only when:
- `registration_complete=true`;
- canonical phone exists.

For a customer that already has a valid positive `bling_contact_id`, return `bling_ready=true` without re-imposing create-only requirements. Existing Bling links are authoritative for reuse.

### 4. missing_fields

Return a deterministic ordered array using only these machine-readable values where applicable:
- `name`
- `phone`
- `document`
- `address`
- `city`

The function must not expose private data in the readiness summary.

## Function interface

Create internal RPC:

`ops2_customer_registration_state_v1(p_customer_id uuid) -> jsonb`

Return shape:

```json
{
  "ok": true,
  "customer_id": "uuid",
  "identity_ready": true,
  "registration_complete": false,
  "bling_ready": false,
  "already_linked_bling": false,
  "missing_fields": ["document", "address"]
}
```

Unknown customer returns `ok=false`, `error="customer_not_found"`, all readiness flags false and `missing_fields` containing the applicable minimum fields.

The function is internal only:
- revoke from `public`, `anon`, and `authenticated`;
- grant to `service_role` only;
- use explicit `search_path`;
- do not expose customer PII in the response beyond `customer_id`.

## Observability

Add an internal summary RPC:

`ops2_customer_registration_summary_v1(p_days integer default 31) -> jsonb`

It returns aggregate counts only:
- recent site orders;
- recent site orders whose customer has incomplete registration;
- distinct customers with incomplete registration;
- distinct customers registration-complete;
- distinct customers Bling-ready but not yet linked;
- Flow events total/review in the same window.

No customer names, phone numbers, documents or addresses are returned by this summary.

## Storefront compatibility and cutover

Phase 1 must NOT immediately replace the live `CLIENTE: NOVO` / `CLIENTE: CADASTRADO` wording used by the WhatsApp handoff because Work may still be stabilizing the current PapoAI automations.

Instead:
- backend gains the canonical state now;
- current site wording remains compatible during Phase 1;
- after Work confirms the PapoAI channel isolation and stability, a coordinated later cutover may introduce `CADASTRO: PENDENTE` / `CADASTRO: COMPLETO` or another structured signal.

No PapoAI text trigger is changed from this repository in Phase 1.

## Flow behavior

Preserve the real Flow mapping already proven in production:
- `custom_1` → bairro;
- `custom_2` → cidade;
- `custom_3` → CPF/CNPJ candidate;
- `custom_4` → endereço;
- `custom_5` → nome completo.

`flow.completed` is represented operationally by the existing normalized message with `flow_token` and consent processed by the current trigger. This phase does not change that parser.

After a Flow updates customer/address data, the readiness function must reflect the new state immediately on the next call. No cached readiness column is introduced in Phase 1.

## Bling behavior

Do not create new automatic customer jobs merely because a Flow completes in Phase 1.

The existing Bling creation guard remains in force. The new readiness function must agree with its create requirements. A later phase may use `bling_ready` when a confirmed order requires synchronization.

## Admin behavior

Phase 1 backend observability may expose aggregate readiness counts to the existing Admin status endpoint, but no new customer-editing workflow is required in this phase.

A later phase may add a queue listing incomplete registrations. Phase 1 focuses on the canonical contract and aggregate health.

## Out of scope

- changing PapoAI automations directly;
- deterministic Flow reminder scheduling;
- confirmation/cancellation automation;
- enabling `structured_order_commit_enabled`;
- conversational item extraction;
- marketing or post-sale automation;
- synchronizing the PapoAI product catalog;
- creating Bling contacts immediately on Flow completion;
- mutating legacy orphan orders by approximation.

## Safety and idempotency

- Readiness is derived, not persisted, so repeated calls are idempotent.
- No function in this phase creates a customer, order, message or Bling object.
- Legacy incomplete records remain visible as incomplete rather than being auto-filled.
- No inference/merge is performed from similar names or approximate phone data.

## Acceptance criteria

1. Existing customer with name + canonical phone but missing document/address returns `identity_ready=true`, `registration_complete=false`, `bling_ready=false`.
2. Customer with name + phone + valid CPF/CNPJ + usable address/city returns `registration_complete=true`.
3. Customer with invalid CPF/CNPJ remains incomplete.
4. Customer with an existing positive `bling_contact_id` returns `bling_ready=true` without requiring create-only data again.
5. Unknown customer fails closed.
6. Existing 7 real Flow events and their parser remain untouched.
7. `structured_order_commit_enabled` remains `false`.
8. Function cannot be executed by `anon` or `authenticated`.
9. Aggregate summary contains no PII.
10. No production customer/order data is modified by the migration except metadata/function definitions required for observability.

## Coordination with Work

Work owns PapoAI panel changes in this phase:
- isolate 0975/1018 registration automations by channel when safely supported;
- correct the 1018 template mapping;
- disable the `PEDIDO -> COMPROU` automation;
- resolve indefinite AI pause behavior;
- align channel timezone when safe;
- preserve the current Flow field set and main Supabase webhook.

This repository owns only the canonical state contract and backend observability. The next phase begins only after both sides are verified together.