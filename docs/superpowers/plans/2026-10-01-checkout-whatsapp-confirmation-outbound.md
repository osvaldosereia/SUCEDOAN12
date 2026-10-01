# Checkout WhatsApp Confirmation Outbound Implementation Plan

> **For agentic workers:** use the repository tests and the Work handoff as the executable source of truth.

**Goal:** Fazer o pedido do site existir independentemente do WhatsApp, enfileirar uma confirmação transacional automática pelo canal correto e tentar retornar à conversa após ~3 segundos sem transformar essa navegação em requisito do checkout.

## Architecture — revised after PapoAI panel validation on 2026-10-01

The real PapoAI webhook editor was validated and its `Enviar mensagem` action requires an approved WhatsApp template. It does not accept free-form `message_text` from the inbound webhook.

Therefore the production architecture is now intentionally simpler:

1. `storefront-v2` remains the only public checkout API.
2. A site order is persisted first, regardless of WhatsApp availability.
3. An idempotent server-side outbox stores one `order_received` communication intent per order.
4. Routing preserves the origin channel: 0975 stays on 0975; 1018 stays on 1018; direct-site fallback is 0975.
5. Every confirmation uses an approved **Utility** template. There is no `session_text` path and no dependency on the 24-hour service window.
6. The dispatcher sends structured request fields to one of two dedicated PapoAI inbound webhooks:
   - `PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL`
   - `PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL`
7. Each PapoAI webhook has only two actions: find/create contact by `phone_e164`, then send that channel's approved utility template.
8. The browser success state is independent from WhatsApp: success is rendered immediately after the order API returns, then a best-effort return to WhatsApp occurs after ~3 seconds with a manual fallback link.

## Global constraints

- Supabase / canonical order engine owns the order.
- PapoAI/WhatsApp is communication only.
- No Make/n8n.
- WhatsApp failure never rolls back or invalidates an order.
- `order_id + message_kind` is unique in the outbound queue.
- No PapoAI secret or webhook URL appears in frontend or committed source.
- No Marketing template may be repurposed for this transactional confirmation.
- No campaign/follow-up participates in the flow.

## Task 1 — outbox and channel routing

Files:

- `supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql`
- `scripts/test-checkout-whatsapp-outbox.mjs`

Required behavior:

- table `ops2_whatsapp_outbox_v1`;
- statuses `pending/sending/sent/retry/failed/suppressed`;
- delivery mode fixed to `utility_template`;
- channel resolution through `orders/conversations/whatsapp_accounts`;
- 0975/1018 isolation;
- fallback to 0975 only when the source channel cannot be resolved;
- idempotency on `(order_id,message_kind)`;
- pending routing may refresh after the PapoAI conversation link is attached;
- sent rows cannot be rerouted.

Verification:

`node scripts/test-checkout-whatsapp-outbox.mjs`

## Task 2 — enqueue without coupling checkout to WhatsApp

The order insert trigger calls `ops2_enqueue_order_whatsapp_v1` in fail-open mode. Any communication enqueue failure is logged and the order remains valid.

The later PapoAI identity/conversation link can refresh the pending outbox routing before send.

## Task 3 — frontend success and WhatsApp return

Files:

- `index.html`
- `vitrine/index.html`
- `scripts/test-checkout-whatsapp-return.mjs`

Required behavior:

- final CTA is `Finalizar pedido`;
- no reserved popup / `window.open('about:blank')`;
- order is submitted first;
- cart is cleared only after order success;
- success UI says `Pedido recebido`;
- customer is told confirmation will arrive on WhatsApp;
- app return after ~3 seconds is best-effort;
- manual `Voltar ao WhatsApp` and `Voltar à vitrine` remain available;
- browser/app-opening failure never becomes order failure;
- `index.html` and `vitrine/index.html` remain byte-identical.

Verification:

`node scripts/test-checkout-whatsapp-return.mjs`

## Task 4 — utility-template dispatcher

Files:

- `supabase/functions/whatsapp-order-outbound-v1/index.ts`
- `supabase/config.toml`
- `supabase/sql/20261001_checkout_whatsapp_outbox_v1.sql`

Provider routes:

- `PAPOAI_ORDER_TEMPLATE_WEBHOOK_0975_URL`
- `PAPOAI_ORDER_TEMPLATE_WEBHOOK_1018_URL`

Payload fields sent to PapoAI:

- `event`
- `source`
- `event_id`
- `order_id`
- `phone_e164`
- `order_number`
- `purchased_at`
- `channel_origin`
- `delivery_mode` = `utility_template`
- `total_formatted`
- `payment_label`
- `delivery_label`

Dispatcher rules:

- service-role protected;
- no public CORS;
- `FOR UPDATE SKIP LOCKED` claim;
- max 5 attempts;
- retry automatically only on explicit provider throttling (`429`);
- ambiguous timeout/5xx failures are marked failed for review instead of risking a duplicate confirmation;
- provider URL missing => `provider_not_configured` and no queue item is consumed.

## Task 5 — PapoAI / Meta setup

Executable instructions are maintained in:

`docs/projects/dona-antonia-operations-2/CHECKOUT-WHATSAPP-WORK-HANDOFF-2026-10-01.md`

Required templates:

- 0975: `pedido_recebido_site_0975`
- 1018: `pedido_recebido_site_1018`
- category: Utility
- locale: pt_BR
- variables:
  - `{{1}}` = order number
  - `{{2}}` = formatted total
  - `{{3}}` = delivery label/date
  - `{{4}}` = payment label

Each PapoAI webhook remains in Test until its own template is approved and selectable.

## Final verification before deployment

Run:

```bash
node scripts/test-checkout-whatsapp-return.mjs
node scripts/test-checkout-whatsapp-outbox.mjs
node scripts/test-checkout-whatsapp-observability.mjs
node scripts/test-site-only-order-registration.mjs
git diff --check
cmp -s index.html vitrine/index.html
```

Only after those checks and after both PapoAI templates/webhooks are ready should production migration/deploy/secrets/activation be considered. No merge to `main` is part of this plan without explicit authorization.
