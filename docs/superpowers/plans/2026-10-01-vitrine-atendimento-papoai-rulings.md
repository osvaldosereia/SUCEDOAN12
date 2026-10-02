# Central de Atendimento — Execution rulings

Plan: `docs/superpowers/plans/2026-10-01-vitrine-atendimento-papoai.md`
Branch: `feat/admin-attendance-papoai-v1`
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
- Attendance gateway deployed successfully as `admin-whatsapp-ops-v1` version 10 with custom bearer Admin validation and `verify_jwt=false` at platform layer.
- Initial gateway action surface was limited to GET `accounts|queue|conversation|context|products` and POST `mark_read|follow_up|issue_catalog`.
- External HTTP smoke from the model runtime could not run because outbound DNS/network is disabled. Underlying RPC behavior and permissions were validated directly in production SQL; gateway unit contract was previously RED→GREEN in the minimal local workspace.

## Task 3 evidence

- Admin navigation now contains `Atendimento` inside Operação, immediately after Central.
- Attendance iframe is created only when `setTab('attendance')` executes; the Admin boot does not load attendance data.
- The same-origin bridge accepts only `da-attendance` messages and validates UUIDs before opening existing customer/order/quote tools.
- GitHub Actions run `36909468061` finished GREEN with integration, UI, API and SQL contracts plus `node --check` for `attendance.js`.

## Ruling 2 — Task 4 refresh strategy

Finding: direct Supabase Realtime from the browser would require widening access to protected canonical conversation/message tables or adding another public read surface. The initial operation has one Admin surface and only two queues.

Decision: use a visibility-aware gateway refresh every 8 seconds. It refreshes the two lightweight queues and the currently selected conversation only while the browser tab is visible. No `postgres_changes` subscription or direct table access is opened.

Cost if wrong: updates can appear up to about 8 seconds after receipt instead of instant websocket delivery. For the current single-operator use case this is preferable to extra security/configuration complexity and can be revisited if real usage proves the delay material.

## Ruling 3 — Marketing opt-out shortcut deferred

Finding: the project already has unresolved RLS/policy findings around `marketing_optout_events_v1` / related marketing state. Adding a new chat-side mutation before that policy is reviewed would couple the attendance module to a known security debt.

Decision: do not add a marketing opt-out mutation in Task 4. The customer card continues to display current consent state. The shortcut will be added only after the canonical marketing policy is hardened or an already-hardened dispatcher is confirmed.

Cost if wrong: an operator must use the existing customer/marketing workflow for opt-out in the meantime. This is safer than creating an unreviewed alternate mutation path.

## Task 4 evidence

- RED observed locally against the pre-Task-4 HTML: contract failed on missing `Enviar catálogo` quick tool.
- GREEN observed locally after implementation: `test-admin-attendance-realtime-v1.mjs` passed and `node --check vitrine/admin/atendimento/attendance.js` passed.
- Quick tools now prepare, but never send: catalog link, quick replies, quote, new sale and follow-up reminder.
- The draft textarea is editable; the actual `Enviar` button remains disabled.
- Catalog generation calls the already authenticated `issue_catalog` gateway action and places the resulting URL in the draft only.
- Follow-up uses the canonical `follow_up` action; quick replies only fill the draft.

## Ruling 4 — Applied migrations are immutable

Finding: the original Task 5 text said to modify `20261001_admin_attendance_v1.sql`, but that migration had already been applied successfully to production during Task 1.

Decision: preserve the applied migration exactly and add a new additive file `supabase/sql/20261001_admin_attendance_outbound_v1.sql` for the outbound queue RPC.

Cost if wrong: there are two attendance SQL files instead of one consolidated file, but deployment history remains reproducible and production drift is avoided.

## Task 5 evidence

- Migration `admin_attendance_outbound_v1` applied successfully.
- Added service-role-only RPC `ops2_admin_attendance_enqueue_text_v1(uuid,text,text)`.
- Browser destination fields are rejected by the gateway; phone/account/customer are resolved server-side from the conversation.
- Runtime gate requires `outbound_provider='papoai'`, `send_enabled=true`, `human_send_enabled=true` and non-null `homologated_at`.
- Service-window gate rejects exactly/over 24 hours; text limit is 4,000 Unicode characters; rate limit is 20 queued human-attendance messages per conversation per 60 seconds.
- Idempotency uses advisory transaction locking plus the existing unique outbox key.
- Production gate-off test on a real recent conversation returned `human_send_not_homologated` with `whatsapp_outbox_v1=0` and zero outbound canonical messages.
- Allowed-path verification ran inside a transaction deliberately rolled back: 23h59 allowed, exact duplicate reused the same rows, conflicting duplicate rejected, 4,001 chars rejected, exactly 24h rejected, and attempt 21/60s rate-limited.
- After rollback, both channels remained `human_send_enabled=false`, `homologated_at=null`, outbox remained 0 and outbound message count remained 0.
- RPC execute privilege is false for `anon`/`authenticated` and true only for `service_role`.
- `admin-whatsapp-ops-v1` version 11 exposes `send_text`, but there is still no transport dispatcher and the UI `Enviar` button remains disabled.

## Safety state

Human WhatsApp send remains disabled. PapoAI automations, ANA and both live channels were not changed by Tasks 1–5. No client message was sent. Production outbox and canonical outbound-message counts remain zero.
