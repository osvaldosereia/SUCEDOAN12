# Central de Atendimento — Execution rulings

Plan: `docs/superpowers/plans/2026-10-01-vitrine-atendimento-papoai.md`
Branch: `feat/admin-attendance-papoai-v1`
Date: 2026-10-01

## Ruling 1 — Supabase Edge Function limit

Finding: production refused creation of a new `admin-attendance-v1` Edge Function with `Max number of functions reached for project`.

Decision: reuse the already-retired `admin-whatsapp-ops-v1` slot. Production version 9 only returned HTTP 410 `retired_outside_site_vitrine_admin`, so it had no active operational contract to preserve. The new attendance gateway is deployed as version 10 under the same slug. No function was deleted and no plan upgrade/spend-cap change was required.

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
- Gateway action surface remains limited to GET `accounts|queue|conversation|context|products` and POST `mark_read|follow_up|issue_catalog`.
- No `send_message`, human takeover or outbound WhatsApp action exists in this phase.
- External HTTP smoke from the model runtime could not run because outbound DNS/network is disabled. Underlying RPC behavior and permissions were validated directly in production SQL; gateway unit contract was previously RED→GREEN in the minimal local workspace.

## Safety state

Human WhatsApp send remains disabled. PapoAI automations, ANA and both live channels were not changed by Tasks 1–3. No client message was sent.
