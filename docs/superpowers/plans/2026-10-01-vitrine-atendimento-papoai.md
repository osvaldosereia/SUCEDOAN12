# Vitrine/Admin Atendimento PapoAI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dona Antônia attendance center inside Vitrine/Admin with two permanently separated WhatsApp queues (0975/1018), one focused conversation pane, a contextual customer/orders/products/assistant pane, and a gated human-outbound path through PapoAI.

**Architecture:** Keep PapoAI as the WhatsApp/Meta transport and ANA/Flow provider, but make Supabase the canonical operational mirror for queues, messages, customer context and send state. Add a small `admin-attendance-v1` gateway and a lazy-loaded `/vitrine/admin/atendimento/` frontend instead of expanding the existing 724 KB Admin monolith. Ship read-only first, then enable human sending only after controlled PapoAI webhook homologation for both channels.

**Tech Stack:** Supabase PostgreSQL/PLpgSQL, Supabase Edge Functions (Deno/TypeScript + supabase-js), plain HTML/CSS/JavaScript used by the current Vitrine/Admin, Node.js contract tests under `scripts/`, PapoAI incoming/outgoing webhooks, WhatsApp Business Platform rules.

**Spec:** `docs/superpowers/specs/2026-10-01-vitrine-atendimento-papoai-design.md`

## Global Constraints

- Canonical Supabase project: `ssbesxgaijknwsjbsbcz`.
- Preserve current PapoAI channels, ANA configuration and automations until the replacement surface is homologated.
- Do not use Make or create a parallel CRM/customer/message database.
- Desktop must keep 0975 and 1018 visible as two separate queues at the same time.
- Free-form outbound is allowed only inside the 24-hour customer-service window, validated again on the server.
- Outside the 24-hour window, free-form send must fail closed; template support is additive and only after an approved-template transport is proven.
- Do not expose PapoAI webhook URLs, secrets or service-role credentials to browser code.
- Reuse the existing passwordless Admin session (`da_finance_access_token_v1`) rather than adding another login/PIN prompt.
- Reuse `whatsapp_messages_v1`, `whatsapp_outbox_v1`, `whatsapp_channel_runtime_v1`, `conversations`, `customers`, `customer_addresses`, `orders`, `order_items` and the current product/stock sources.
- Treat PapoAI acceptance as `accepted`, never as `delivered` or `read` unless a provider event proves those states.
- Initial message page size: 30. Queue page size: 50 per channel. Product search must be lazy/debounced and never preload the catalog.
- Initial human-send message limit: 4,000 Unicode characters after trim; empty messages are rejected.
- Initial human-send rate limit: 20 messages per conversation per 60 seconds, enforced server-side.
- First release must not implement Kanban, lead scoring, departments, campaigns, generic automation builders or a second chatbot.
- Media send/playback stays disabled until the real PapoAI media contract is homologated; unknown media must render as a safe placeholder.

## Review Focus

- Same customer has conversations on both numbers: selecting/sending must never cross the `whatsapp_account_id` boundary.
- Conversation has no linked customer: chat must still open by phone; customer/order actions degrade safely instead of failing the whole screen.
- Customer-service window expires while composer is open: backend must reject stale free-form send even if UI still looked open.
- Duplicate click/network retry: only one outbox/message record may be created for one `idempotency_key`.
- PapoAI returns HTTP 200 but no trustworthy provider message identifier/status: local message becomes `accepted`, never `delivered/read`.

---

### Task 1: Canonical attendance read/state contract

**Files:**
- Create: `supabase/sql/20261001_admin_attendance_v1.sql`
- Create: `scripts/test-admin-attendance-sql-v1.mjs`

**Interfaces:**
- Consumes: `whatsapp_accounts`, `conversations`, `whatsapp_messages_v1`, `customers`, `customer_addresses`, `orders`, `order_items`, `ops2_customer_registration_state_v1(uuid)`.
- Produces:
  - table `public.attendance_conversation_state_v1(conversation_id uuid primary key, last_read_message_id uuid null, last_read_at timestamptz null, follow_up_at timestamptz null, updated_at timestamptz not null)`;
  - `public.ops2_admin_attendance_queue_v1(p_whatsapp_account_id uuid, p_limit integer default 50, p_search text default null, p_filter text default 'all') returns jsonb`;
  - `public.ops2_admin_attendance_conversation_v1(p_conversation_id uuid, p_before timestamptz default null, p_limit integer default 30) returns jsonb`;
  - `public.ops2_admin_attendance_context_v1(p_conversation_id uuid) returns jsonb`;
  - `public.ops2_admin_attendance_mark_read_v1(p_conversation_id uuid, p_message_id uuid) returns jsonb`;
  - `public.ops2_admin_attendance_follow_up_v1(p_conversation_id uuid, p_follow_up_at timestamptz) returns jsonb`.

- [ ] **Step 1: Write the failing SQL contract test**

Create `scripts/test-admin-attendance-sql-v1.mjs` asserting that the SQL file contains the exact table/functions above, RLS on `attendance_conversation_state_v1`, and revokes from `public`, `anon`, `authenticated` with execute granted only to `service_role`.

- [ ] **Step 2: Run the test and verify red**

Run: `node scripts/test-admin-attendance-sql-v1.mjs`

Expected: FAIL because `supabase/sql/20261001_admin_attendance_v1.sql` does not yet exist.

- [ ] **Step 3: Implement the attendance SQL contract**

Pinned behavior:
- queue rows are strictly scoped by the passed active `whatsapp_account_id`;
- display name = linked customer name, otherwise canonical contact phone;
- `last_activity_at = greatest(last_inbound_at,last_outbound_at,updated_at,created_at)`;
- unread count = inbound messages newer than `attendance_conversation_state_v1.last_read_at`; no row means all current inbound since conversation open are unread;
- queue order = unread/attention first, then `last_activity_at desc`;
- filters accepted exactly: `all`, `unread`, `human`; unknown filter falls back to `all`;
- search matches customer name or canonical phone only;
- conversation function returns at most clamped 1..50 messages, newest page selected then returned chronological; `p_before` paginates strictly older rows;
- context returns customer summary, masked document, preferred active/default address, canonical registration state, up to 10 customer orders newest-first, and no unrelated customer data;
- mark-read verifies message belongs to conversation before updating state;
- follow-up accepts null to clear or a future timestamp; past timestamp is rejected.

- [ ] **Step 4: Apply the migration to canonical Supabase**

Use migration name `admin_attendance_v1` with the versioned SQL from this task.

- [ ] **Step 5: Verify production read behavior without mutations to business data**

Read-only checks must prove:
- both active accounts are returned distinctly;
- queue for 0975 never contains a 1018 conversation and vice versa;
- a conversation with no `customer_id` still returns phone/messages;
- message page contains no more than 30 with default arguments;
- context order list is newest-first;
- no customer/order/message rows were created by reads.

- [ ] **Step 6: Run permissions/RLS checks**

Expected: `anon` and `authenticated` cannot select/write the state table or execute the RPCs directly; `service_role` can.

- [ ] **Step 7: Commit**

Commit message: `feat: add canonical attendance read model`

---

### Task 2: Private `admin-attendance-v1` read-only gateway

**Files:**
- Create: `supabase/functions/admin-attendance-v1/index.ts`
- Create: `supabase/functions/_shared/admin-attendance-domain-v1.mjs`
- Modify: `supabase/config.toml`
- Create: `scripts/test-admin-attendance-api-v1.mjs`

**Interfaces:**
- Consumes: Task 1 RPCs, existing passwordless Supabase Auth/Admin session.
- Produces HTTP actions:
  - `GET ?action=accounts`
  - `GET ?action=queue&account_id=<uuid>&limit=50&filter=all&search=`
  - `GET ?action=conversation&conversation_id=<uuid>&before=<iso>&limit=30`
  - `GET ?action=context&conversation_id=<uuid>`
  - `GET ?action=products&q=<text>&limit=12`
  - `POST ?action=mark_read` body `{conversation_id,message_id}`
  - `POST ?action=follow_up` body `{conversation_id,follow_up_at|null}`
  - `POST ?action=issue_catalog` body `{conversation_id}`.

- [ ] **Step 1: Write the failing API/domain tests**

`test-admin-attendance-api-v1.mjs` must import pure helpers from `_shared/admin-attendance-domain-v1.mjs` and assert:
- UUID validation rejects arbitrary phone/account IDs;
- allowed filters are exactly `all|unread|human`;
- `serviceWindowState(lastInbound, now)` returns open only when `now < lastInbound + 24h`;
- document masking never returns full CPF/CNPJ;
- product query shorter than 2 non-space characters returns no search request;
- source file declares only the read/safe actions above at this phase.

- [ ] **Step 2: Run red test**

Run: `node scripts/test-admin-attendance-api-v1.mjs`

Expected: FAIL with missing module/function.

- [ ] **Step 3: Implement pure domain helpers**

Exports:
- `validUuid(value) -> string|null`
- `attendanceFilter(value) -> 'all'|'unread'|'human'`
- `serviceWindowState(lastInboundIso, nowIso) -> {open:boolean,expires_at:string|null,remaining_seconds:number}`
- `maskDocument(value) -> string|null`
- `normalizeProductQuery(value) -> string|null`.

- [ ] **Step 4: Implement `admin-attendance-v1`**

Requirements:
- CORS only `https://donaantonia.com.br` and `https://www.donaantonia.com.br`;
- require `Authorization: Bearer <passwordless admin access token>`;
- validate token with Supabase Auth and require matching active row in `admin_users`;
- use service-role only after authorization;
- product search returns only id/name/GTIN/image/current price/effective sellable stock/offer fields, maximum 12;
- `issue_catalog` resolves phone/account from the conversation server-side and calls existing `ops2_issue_papoai_catalog_link_v1`; browser cannot choose another destination;
- no outbound send/takeover action exists yet.

- [ ] **Step 5: Add function config and run tests**

Add `[functions.admin-attendance-v1] verify_jwt = false` because the function performs its own bearer validation, consistent with current Admin gateways.

Run: `node scripts/test-admin-attendance-api-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Deploy and perform read-only smoke calls**

Verify 401 without token, 200 with current passwordless Admin token, separate account queues, conversation/context/product search and catalog-link generation without sending a WhatsApp message.

- [ ] **Step 7: Commit**

Commit message: `feat: add attendance admin gateway`

---

### Task 3: Lazy-loaded attendance UI and two permanent channel queues

**Files:**
- Create: `vitrine/admin/atendimento/index.html`
- Create: `vitrine/admin/atendimento/attendance.css`
- Create: `vitrine/admin/atendimento/attendance.js`
- Modify: `vitrine/admin/index.html`
- Create: `scripts/test-admin-attendance-ui-v1.mjs`
- Create: `scripts/test-admin-attendance-integration-v1.mjs`

**Interfaces:**
- Consumes: Task 2 HTTP API and existing sessionStorage key `da_finance_access_token_v1`.
- Produces: lazy-loaded iframe/module at `/vitrine/admin/atendimento/?embedded=1` and Admin tab `data-tab="attendance"`.

- [ ] **Step 1: Write failing UI/integration tests**

Assert:
- standalone page has two desktop queue containers with fixed labels `0975` and `1018`;
- one conversation pane and one context pane with tabs `Cliente`, `Pedidos`, `Produtos`, `Assistente`;
- no Kanban/pipeline/campaign UI;
- JS references `ADMIN_ATTENDANCE_API`, token key and page sizes 50/30;
- Admin has an `Atendimento` tab and embeds `/vitrine/admin/atendimento/?embedded=1` only when selected;
- main Admin inline JS still compiles.

- [ ] **Step 2: Run tests red**

Run:
`node scripts/test-admin-attendance-ui-v1.mjs && node scripts/test-admin-attendance-integration-v1.mjs`

Expected: FAIL because the module/tab do not exist.

- [ ] **Step 3: Build the desktop shell**

Desktop grid order must be exactly: `0975 queue | 1018 queue | conversation | context`.

Queue card contains only name/phone, last-message preview, time, unread badge and at most `Humano`, `Pedido`, `Cadastro pendente` chips.

- [ ] **Step 4: Implement loading and selection behavior**

On boot:
- obtain/reuse the same passwordless Admin token flow used by Orçamentos;
- load active accounts and map by final digits 0975/1018, not by array position;
- fetch both queues independently;
- global search debounced 250 ms;
- selecting a conversation loads last 30 messages and context in parallel;
- scrolling to top loads older page while preserving scroll position;
- selecting a conversation marks the newest visible inbound as read only after the conversation render succeeds.

- [ ] **Step 5: Render conversation safely**

Use `textContent` for message text; never inject raw customer HTML. Render supported text normally and unsupported/media-without-URL as a neutral type placeholder. Show `ANA atendendo` vs `Atendimento humano` from canonical conversation mode/state.

Composer is visible but disabled with copy `Envio humano em homologação` in this task.

- [ ] **Step 6: Build context tabs**

Cliente: identity/address/registration/marketing consent/last purchase/count/LTV, masked document.

Pedidos: up to 10 customer orders and `Abrir pedido` bridge to parent.

Produtos: no data until query >=2 chars; render max 12 with photo, price, sellable stock and offer.

Assistente: show the three buttons but disabled with `Disponível após homologação do núcleo de atendimento` until Task 7.

- [ ] **Step 7: Add parent bridge without duplicating Admin tools**

Child emits same-origin `postMessage` events:
- `{type:'da-attendance',action:'open_order',order_id}`
- `{type:'da-attendance',action:'open_customer',customer_id}`
- `{type:'da-attendance',action:'open_quote',customer_id}`
- `{type:'da-attendance',action:'new_sale',customer_id}`.

Parent validates `event.origin === location.origin` and IDs before switching existing Admin tabs/actions. Quote action seeds `dona_antonia_orcamento_draft_v1` with only the selected `customer_id` and `source:'attendance'`; no duplicated quote editor is created.

- [ ] **Step 8: Add responsive behavior**

Desktop >=1180px: four simultaneous areas.
Tablet 760..1179px: context is drawer; both queues remain accessible.
Mobile <760px: `0975|1018` channel tabs -> list -> conversation; context opens drawer.

- [ ] **Step 9: Run tests and commit**

Expected both Node tests PASS and Admin script compiles.

Commit message: `feat: add Vitrine attendance workspace`

---

### Task 4: Realtime refresh, follow-up and operational shortcuts

**Files:**
- Modify: `vitrine/admin/atendimento/attendance.js`
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Modify: `supabase/functions/admin-attendance-v1/index.ts`
- Create: `scripts/test-admin-attendance-realtime-v1.mjs`

**Interfaces:**
- Consumes: new canonical inbound rows already mirrored into `whatsapp_messages_v1`, Task 1 follow-up state.
- Produces: low-cost refresh behavior and quick tools.

- [ ] **Step 1: Write failing test**

Assert the UI has exactly these quick tools in v1: `Enviar catálogo`, `Respostas rápidas`, `Criar orçamento`, `Nova venda`, `Marcar retorno`, `Não receber ofertas`; no campaign builder.

Assert the JS has a reconnectable Realtime subscription or a bounded fallback refresh no faster than every 15 seconds while the attendance tab is visible.

- [ ] **Step 2: Implement update strategy**

Prefer Supabase Realtime only for `whatsapp_messages_v1` inserts if authenticated subscription is viable with current RLS. If not viable, use one 15-second queue refresh only while document is visible; do not poll message history globally.

On a matching new message: refresh only that channel queue; if its conversation is open, fetch the newest page and merge by message UUID/provider ID.

- [ ] **Step 3: Implement quick replies locally**

Initial fixed reply keys only: `pagamento`, `entrega`, `cidades`, `catalogo`, `prazo`, `pedido_recebido`. Selecting one fills the composer draft; it never sends automatically.

- [ ] **Step 4: Implement follow-up and opt-out actions**

`Marcar retorno` calls Task 1 state via API. `Não receber ofertas` updates the canonical customer marketing consent through the existing customer-safe write path; if no customer is linked, show a non-destructive message instead of creating one.

- [ ] **Step 5: Verify and commit**

Run relevant tests. Commit message: `feat: add attendance realtime and shortcuts`

---

### Task 5: Human outbound queue and Meta 24-hour gate — transport still disabled

**Files:**
- Modify: `supabase/sql/20261001_admin_attendance_v1.sql`
- Modify: `supabase/functions/_shared/admin-attendance-domain-v1.mjs`
- Modify: `supabase/functions/admin-attendance-v1/index.ts`
- Modify: `vitrine/admin/atendimento/attendance.js`
- Create: `scripts/test-admin-attendance-outbound-v1.mjs`

**Interfaces:**
- Consumes: `whatsapp_outbox_v1`, `whatsapp_messages_v1`, `whatsapp_channel_runtime_v1`, conversation/account/phone bindings.
- Produces: `POST ?action=send_text` body `{conversation_id,text,idempotency_key}` and server-created canonical queued outbound state.

- [ ] **Step 1: Write failing domain/outbound tests**

Cases:
1. 23h59 since last inbound -> allowed only if `human_send_enabled=true` and provider transport homologated;
2. exactly/over 24h -> `service_window_closed`;
3. conversation/account/phone mismatch -> fail closed;
4. 4,001-char message -> reject;
5. duplicate idempotency key -> same logical result, no duplicate rows;
6. 21st message within 60s for same conversation -> rate limited;
7. browser-supplied destination phone/account is ignored/not accepted by API.

- [ ] **Step 2: Add canonical enqueue RPC**

Produce `ops2_admin_attendance_enqueue_text_v1(p_conversation_id uuid,p_text text,p_idempotency_key text) returns jsonb`.

Server resolves account/customer/phone from conversation, verifies last inbound <24h, runtime provider=`papoai`, `send_enabled=true`, `human_send_enabled=true`, and inserts:
- one `whatsapp_messages_v1` outbound row with `sender_kind='human'`, `provider='papoai'`, `status_current='queued'`;
- one `whatsapp_outbox_v1` row `provider='papoai'`, `status='queued'`, linked to message.

The runtime flag remains false until Task 6 canary.

- [ ] **Step 3: Expose `send_text` through authenticated gateway**

If runtime/homologation gate is false, return `human_send_not_homologated` without queueing.

- [ ] **Step 4: Enable composer logic but preserve production gate**

UI displays green/amber service-window badge from API data; server remains authority. When gate is false the composer stays disabled. Do not add template sending yet.

- [ ] **Step 5: Apply additive migration, run tests, verify zero real sends**

Expected: all synthetic/test writes roll back or target no real contact; `whatsapp_outbox_v1` production has no new real customer send caused by this task.

- [ ] **Step 6: Commit**

Commit message: `feat: add gated attendance outbound queue`

---

### Task 6: PapoAI transport, takeover and release canary

**Files:**
- Create: `supabase/functions/papoai-attendance-transport-v1/index.ts`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/admin-attendance-v1/index.ts`
- Modify: `vitrine/admin/atendimento/attendance.js`
- Create: `scripts/test-papoai-attendance-transport-v1.mjs`
- Modify after successful canary: `supabase/sql/20261001_admin_attendance_v1.sql` only for canonical runtime enablement statements if needed.

**Interfaces:**
- Consumes: queued `whatsapp_outbox_v1` row and server secrets:
  - `PAPOAI_ATTENDANCE_SEND_0975_URL`
  - `PAPOAI_ATTENDANCE_SEND_1018_URL`
  - `PAPOAI_ATTENDANCE_TAKEOVER_URL`
  - `PAPOAI_ATTENDANCE_RELEASE_URL`.
- Produces:
  - `POST` internal dispatch of one queued outbox row;
  - `POST ?action=takeover` `{conversation_id}`;
  - `POST ?action=release` `{conversation_id}`.

- [ ] **Step 1: Configure PapoAI incoming webhook contracts outside code, without touching existing automations**

Required PapoAI endpoints:
- send-0975: `Buscar ou criar contato` by supplied canonical phone -> `Parar resposta do assistente` -> `Enviar mensagem` on channel 0975 using supplied text;
- send-1018: same but fixed channel 1018;
- takeover: `Buscar ou criar contato` -> `Parar resposta do assistente`;
- release: `Buscar ou criar contato` -> `Concluir atendimento`.

No campaign/template/follow-up activation is part of this task.

- [ ] **Step 2: Write failing transport tests**

Assert channel routing is by canonical account slug/final digits, URLs come only from environment, secrets never appear in response, non-queued/foreign rows cannot dispatch, network retry preserves idempotency, and PapoAI 2xx maps outbox `sent` + message `accepted` only.

- [ ] **Step 3: Implement transport function**

`dispatchOutbox(outboxId)` claims one queued row, revalidates conversation/account/phone and 24h window immediately before HTTP send, selects the correct server-only PapoAI URL, posts only phone/text plus an event/idempotency reference, then:
- 2xx => outbox `sent`, message `accepted`, `provider_message_id` only if actually returned;
- non-2xx/exception => outbox `failed`, message `failed`, sanitized `last_error`;
- never marks delivered/read.

No background cron: the authenticated Admin send request enqueues then immediately invokes one dispatch attempt.

- [ ] **Step 4: Implement takeover/release**

Takeover server-side sequence: validate conversation -> call takeover webhook -> only on success set conversation `mode='human'`, `human_takeover_at=now()`, update human state.

Release: call release webhook -> only on success clear human mode according to existing conversation schema and set resume timestamp/state. Failure leaves prior state unchanged.

- [ ] **Step 5: Controlled canary only on an explicitly authorized test contact**

Verify separately for 0975 and 1018:
- takeover stops ANA response;
- one text sent from Vitrine arrives in the same originating WhatsApp conversation;
- no cross-channel send;
- local message shows `accepted`, not delivered;
- release allows normal ANA behavior on the next eligible inbound according to PapoAI configuration.

If either channel fails, keep `human_send_enabled=false` for both or only enable the proven channel if the runtime is explicitly per-account; do not infer success.

- [ ] **Step 6: Enable runtime only after evidence**

Set `whatsapp_channel_runtime_v1.human_send_enabled=true` only for each independently homologated account and record `homologated_at` plus evidence metadata.

- [ ] **Step 7: Run tests and commit**

Commit message: `feat: homologate PapoAI human attendance transport`

---

### Task 7: Copilot, product-to-draft and final usability polish

**Files:**
- Modify: `supabase/functions/admin-attendance-v1/index.ts`
- Modify: `vitrine/admin/atendimento/attendance.js`
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Create: `scripts/test-admin-attendance-assistant-v1.mjs`

**Interfaces:**
- Consumes: selected conversation messages/context/product live data and existing OpenAI-backed internal intelligence capability.
- Produces API action `POST ?action=assistant` body `{conversation_id,mode}` where mode is exactly `summary|reply|next_step`.

- [ ] **Step 1: Write failing assistant tests**

Assert mode allowlist, bounded history, no automatic send, and `reply` result only fills draft. Product/stock/price facts must be passed as live structured context when needed, never invented by model text.

- [ ] **Step 2: Implement assistant endpoint**

Use at most the latest 40 textual messages plus compact customer/order context. Return plain structured `{ok,mode,text}`. Do not write customer/order/message rows.

- [ ] **Step 3: Enable the three Assistant-tab buttons**

`Resumir conversa` shows read-only summary; `Sugerir resposta` places text into composer without sending; `O que falta resolver?` shows a short checklist-style result.

- [ ] **Step 4: Implement product action**

`Enviar produto` formats one concise draft from current product name, current price and availability; it fills composer only. `Adicionar ao orçamento` uses the parent quote bridge; no catalog duplication.

- [ ] **Step 5: UX/performance verification**

Verify:
- Admin sections outside Atendimento do not load attendance JS/data;
- opening Atendimento loads no full product catalog;
- first message payload <=30 messages;
- both desktop queues remain independently scrollable;
- tablet/mobile drawers do not hide the send field after keyboard focus;
- no layout horizontal overflow on common 360px mobile width.

- [ ] **Step 6: Commit**

Commit message: `feat: add attendance copilot and product actions`

---

### Task 8: Full verification, continuity and cutover decision

**Files:**
- Modify: `docs/projects/dona-antonia-operations-2/HANDOFF.md`
- Modify: `docs/RUNTIME-INVENTORY.md` only if runtime inventory changed.

**Interfaces:**
- Consumes all previous tasks.
- Produces a recorded production checkpoint; does not remove PapoAI chat capability.

- [ ] **Step 1: Run all new contract tests**

Run all `scripts/test-admin-attendance-*.mjs` and `scripts/test-papoai-attendance-transport-v1.mjs` plus existing `scripts/test-orcamento-admin-integration.mjs` and passwordless/session tests.

Expected: all PASS.

- [ ] **Step 2: Run production smoke matrix**

For both 0975 and 1018 verify: queue isolation, select/open, unread, pagination, client context, order context, product search, catalog link, takeover, one authorized human send, release. Verify an outside-24h conversation cannot free-send.

- [ ] **Step 3: Check security and logs**

Run Supabase advisors and inspect attendance/PapoAI function logs for new 4xx/5xx errors. Report pre-existing findings separately; do not claim unrelated RLS warnings fixed.

- [ ] **Step 4: Record handoff**

Document exact deployed function versions, runtime flags per account, canary evidence, known limitations (especially media/templates/read receipts) and rollback rule: set `human_send_enabled=false` while leaving read-only Central available.

- [ ] **Step 5: Do not remove PapoAI operational access yet**

Keep the PapoAI chat available as fallback until the Central has been used successfully in normal operation. No deletion/disable of PapoAI channels or ANA is part of this plan.

- [ ] **Step 6: Final commit**

Commit message: `docs: record attendance center production checkpoint`
