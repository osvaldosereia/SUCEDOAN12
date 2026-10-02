# Central de Atendimento — Execution rulings

Plan: `docs/superpowers/plans/2026-10-01-vitrine-atendimento-papoai.md`
Branch: `feat/admin-attendance-papoai-v2`
Date: 2026-10-01

## Ruling 1 — Supabase Edge Function limit

Finding: production refused creation of a new `admin-attendance-v1` Edge Function with `Max number of functions reached for project`.

Decision: reuse the already-retired `admin-whatsapp-ops-v1` slot. Production version 9 only returned HTTP 410 `retired_outside_site_vitrine_admin`, so it had no active operational contract to preserve. The new attendance gateway is deployed under the same slug. No function was deleted and no plan upgrade/spend-cap change was required.

Cost if wrong: an unknown legacy caller of `admin-whatsapp-ops-v1` would now receive the authenticated attendance API instead of HTTP 410. This is fail-closed for unauthenticated callers because the new gateway requires a valid active Admin bearer session.

## Task 1 evidence

- Migration `admin_attendance_v1` applied successfully to canonical project `ssbesxgaijknwsjbsbcz`.
- Both active accounts returned independently: 0975 and 1018.
- Queue isolation check returned `isolated=true` for both accounts.
- Conversation with no linked customer opens without forcing identity creation.
- Conversation with 67 canonical messages returned exactly 30 using the default page size.
- Customer context returned orders newest-first.
- Read-only checks left `customers=508`, `orders=117`, `whatsapp_messages_v1=1182`; `attendance_conversation_state_v1` remained empty before UI read-state use.
- RLS enabled. `anon`/`authenticated` have no table SELECT and no queue RPC execute; `service_role` has both.

## Task 2 deployment evidence

- New-function deploy under `admin-attendance-v1` was rejected by project function-count limit before creation.
- `admin-whatsapp-ops-v1` production source was inspected and confirmed retired (HTTP 410 only).
- Attendance gateway deployed successfully as `admin-whatsapp-ops-v1` with custom bearer Admin validation and `verify_jwt=false` at platform layer.
- Initial gateway action surface was limited to GET `accounts|queue|conversation|context|products` and POST `mark_read|follow_up|issue_catalog`.
- External HTTP smoke from the model runtime could not run because outbound DNS/network is disabled. Underlying RPC behavior and permissions were validated directly in production SQL; gateway unit contract was RED→GREEN.

## Task 3 evidence

- Admin navigation contains `Atendimento` inside Operação, immediately after Central.
- Attendance iframe is created only when `setTab('attendance')` executes; the Admin boot does not load attendance data.
- The same-origin bridge accepts only `da-attendance` messages and validates UUIDs before opening existing customer/order/quote tools.
- GitHub Actions integration, UI, API and SQL contracts plus `node --check` for `attendance.js` passed.

## Ruling 2 — Refresh strategy

Finding: direct Supabase Realtime from the browser would require widening access to protected canonical conversation/message tables or adding another public read surface. The initial operation has one Admin surface and only two queues.

Decision: use a visibility-aware gateway refresh every 15 seconds. It refreshes the two lightweight queues and the currently selected conversation only while the browser tab is visible. No `postgres_changes` subscription or direct table access is opened.

Cost if wrong: updates can appear up to about 15 seconds after receipt instead of instant websocket delivery. For the current single-operator use case this is preferable to extra security/configuration complexity and can be revisited if real usage proves the delay material.

## Task 4 evidence

- Quick tools prepare, but do not send: catalog link, quick replies, quote, new sale and follow-up reminder.
- The draft textarea is editable; the actual `Enviar` button remains disabled.
- Catalog generation calls the authenticated `issue_catalog` gateway action and places the resulting URL in the draft only.
- Follow-up uses the canonical `follow_up` action; quick replies only fill the draft.
- Marketing opt-out was later added through a dedicated service-role-only attendance RPC after permission checks; no direct browser table mutation was opened.

## Ruling 3 — Applied migrations are immutable

Finding: the original outbound plan required new database behavior after the base attendance migration had already been applied.

Decision: preserve applied migrations and add only additive files (`20261001_admin_attendance_outbound_v1.sql`, `20261001_admin_attendance_transport_v1.sql`, `20261001_admin_attendance_marketing_optout_v1.sql`).

Cost if wrong: there are multiple attendance SQL files instead of one consolidated file, but deployment history remains reproducible and production drift is avoided.

## Historical outbound preparation

- Service-role-only RPC `ops2_admin_attendance_enqueue_text_v1(uuid,text,text)` was created behind runtime gates.
- Destination data is resolved server-side from the conversation; client-supplied phone/account/customer fields are not accepted.
- Runtime gate requires `outbound_provider='papoai'`, `send_enabled=true`, `human_send_enabled=true` and non-null `homologated_at`.
- Service-window, text-length, rate-limit and idempotency protections were tested while gates remained off.
- Both channels remained `human_send_enabled=false`, `homologated_at=null`, and no human attendance message was sent.
- These database primitives remain fail-closed for possible future transport use; they are not exposed by the current gateway.

## Ruling 4 — PapoAI human transport is not homologated

Finding from the controlled PapoAI investigation:

- 0975 and 1018 are separate official API channels and existing order-confirmation webhooks must remain untouched.
- No dedicated human SEND endpoint accepting `phone`, `text`, `event_ref` was identified.
- The investigated PapoAI webhook action for official channels did not provide the required free-form human-send contract.
- Idempotency and provider message ID behavior were not demonstrated.
- `Parar resposta do assistente` exists but takeover was not homologated end-to-end; no reliable release/resume action was demonstrated.

Decision:

1. Do not activate human sending from the Vitrine Admin.
2. Remove `send_text`, `takeover` and `release` from the active `admin-whatsapp-ops-v1` action surface instead of relying only on feature flags.
3. Keep `human_send_enabled=false` and `homologated_at=null` on both channels.
4. Record runtime state as `attendance_human_transport=blocked` with fallback `copy_and_open_papoai`.
5. Keep the Admin useful for queue reading, customer/order/product context, catalog drafting, quick replies, follow-up and marketing opt-out.
6. Provide a manual fallback: prepare the response in the Admin, copy it, open the official PapoAI app, then send from the correct channel there.
7. Do not switch only one channel to direct Meta Cloud API. The 1018 account currently has Meta technical IDs recorded while 0975 does not, and both channels remain operationally owned by PapoAI; asymmetric transport would create routing/provider risk.

## Ruling 4 evidence

- TDD RED: after tests were changed to require the safe fallback and reject unsupported actions, CI failed against the old transport implementation.
- TDD GREEN: after implementation, attendance contracts passed.
- Production `admin-whatsapp-ops-v1` version 14 is ACTIVE and exposes only:
  - GET `accounts|queue|conversation|context|products`
  - POST `mark_read|follow_up|issue_catalog|marketing_opt_out`
- Production v14 contains no PapoAI human-send endpoint secrets, dispatcher, takeover or release code.
- UI contains `Copiar resposta` and `Abrir PapoAI`; `Enviar` remains disabled.
- The unused PapoAI attendance transport helper was removed from the repository.
- Runtime metadata for both 0975 and 1018 records transport `blocked` and fallback `copy_and_open_papoai`.
- `human_send_enabled=false` and `homologated_at=null` remain unchanged for both channels.
- The attendance branch was synchronized with the current checkout WhatsApp/Vault changes from `main` and the combined Attendance + checkout WhatsApp contract suite passed.

## Safety state

Human WhatsApp send from the Vitrine Admin is disabled by UI, gateway surface and runtime gates. PapoAI automations, ANA and the live channel configuration were not modified by this implementation. Existing order-confirmation webhooks remain separate. No client message was sent during the attendance rollout.
