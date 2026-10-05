# Código público único e WhatsApp pós-separação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** usar `public_code` (`DAxxx`) como único número visível do pedido e avisar o cliente automaticamente após a separação, com mensagem distinta para pedido completo ou com faltas.

**Architecture:** manter UUID e `orders.order_number` como identificadores técnicos internos. Resolver `public_code` por `order_public_snapshots_v1`, usar esse código nos templates Meta e no Admin, e criar uma notificação transacional idempotente de pós-separação que depende somente do resultado físico/final da separação, não do sucesso do Bling.

**Tech Stack:** Supabase/Postgres, Edge Functions Deno/TypeScript, Meta WhatsApp Cloud API, Admin HTML/JS, GitHub Actions/Node contract tests.

**Spec:** aprovação do usuário nesta conversa em 2026-10-05.

## Global Constraints
- Não alterar o UUID nem o `orders.order_number` técnico.
- Número humano/cliente: sempre `public_code`, formato `DAxxx`.
- Templates pós-separação são Utility e devem ser idempotentes.
- Falha do Bling não pode impedir a notificação após a separação física consolidada.
- Se houver faltas, listar os itens faltantes e informar valor original, abatimento e total final.
- Canais 0975 e 1018 permanecem equivalentes e usam a conta Meta correta.

## Review Focus
- Pedido sem snapshot público: gerar/resolver `public_code` antes do envio.
- Repetição/retry: não duplicar mensagem ao cliente.
- Separação com zero faltas vs. uma ou várias faltas.
- Falha do Bling depois da separação: comunicação continua independente.
- Pedido antigo já concluído: não disparar retroativamente em massa.

---

### Task 1: Contratos RED
**Files:**
- Modify: `scripts/test-admin-order-whatsapp-ui-integration.mjs`
- Modify: `scripts/test-admin-orders-clean-flow-v3.mjs`

- [ ] Exigir `public_code` no template de confirmação e ausência do número completo na variável humana.
- [ ] Exigir templates Utility de pós-separação e enfileiramento idempotente independente do Bling.
- [ ] Exigir o Admin usando `public_code` como número mostrado.
- [ ] Rodar CI e confirmar falha antes da implementação.

### Task 2: Confirmação com código único
**Files:**
- Modify: `supabase/functions/admin-orders-v1/index.ts`

**Interfaces:**
- Consumes: `ops2_order_public_link_v1(p_order_id)`.
- Produces: primeira variável do template = `public_code`.

- [ ] Trocar o identificador humano do pedido por `public_code`.
- [ ] Preservar `orders.order_number` somente em payload/auditoria interna.
- [ ] Usar template Utility organizado/aprovado para os dois canais.

### Task 3: Notificação automática da separação
**Files:**
- Create: `supabase/functions/order-separation-notify-v1/index.ts`
- Create: `supabase/migrations/20261005_order_separation_customer_notify_v1.sql`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`

**Interfaces:**
- Consumes: `order_separation_completions_v1`, `missing_items`, `missing_subtotal`, `final_total`, `public_code`.
- Produces: uma notificação idempotente por pedido/resultado de separação.

- [ ] Criar outbox/idempotência para pós-separação sem backfill automático.
- [ ] Enfileirar assim que o resultado físico/final estiver consolidado, antes do gate do Bling.
- [ ] Enviar template “pedido preparado” sem faltas ou “pedido ajustado” com faltas.
- [ ] Persistir WAMID/status de envio.

### Task 4: Número único no Admin
**Files:**
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `vitrine/admin/index.html`

**Interfaces:**
- Produces: `public_code` nos objetos de pedido do Admin.

- [ ] Mapear `public_code` por `order_id`.
- [ ] Mostrar `public_code` nos cards, detalhes e atalhos humanos; manter identificadores técnicos invisíveis.

### Task 5: GREEN + produção
- [ ] Rodar contratos Node/CI completos.
- [ ] Aplicar migration no Supabase.
- [ ] Deploy das Edge Functions alteradas/novas.
- [ ] Smoke read-only: conferir templates, outbox e um pedido recente sem disparar mensagem manual extra.
- [ ] Revisar diff e mergear apenas após CI verde.