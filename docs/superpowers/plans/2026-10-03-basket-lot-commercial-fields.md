# Basket Lot Commercial Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir definir nome público e valor comercial ao criar um lote de cesta, preservando como ajuste oculto a diferença entre o preço comercial e a soma dos produtos mesmo após personalização no checkout.

**Architecture:** O lote será a fonte do snapshot comercial: `public_name`, `sale_price_override`, `component_sum_snapshot` e `hidden_adjustment_snapshot`. O Admin envia nome/preço junto do rascunho; o banco calcula a soma dos produtos no servidor. No storefront, o lote ativo fornece nome/preço; no checkout, a personalização altera apenas deltas de produtos, preservando o ajuste oculto original.

**Tech Stack:** HTML/JavaScript do Vitrine Admin, Supabase Edge Functions (TypeScript/Deno), PostgreSQL/PLpgSQL, Node 24 + Playwright.

**Spec:** Solicitação do usuário de 2026-10-03 no chat atual.

## Global Constraints

- Manter compatibilidade com lotes existentes: ausência de nome/preço no lote usa os dados da cesta modelo.
- O preço/soma comercial deve ser calculado/validado no servidor; não confiar em soma enviada pelo browser.
- O kit universal de higiene não define o nome público da cesta; o lote de alimentos é a fonte comercial da cesta dividida.
- Montar lote não ativa venda automaticamente.
- Alterar/remover produtos no checkout não pode recalcular nem apagar o ajuste oculto do lote.

## Review Focus

- Lote antigo sem `public_name` ou `sale_price_override` deve continuar vendendo com nome/preço da cesta modelo.
- Rascunho retomado deve manter nome e preço já salvos.
- Duplicação de lote deve copiar os dados comerciais como ponto de partida sem alterar o lote original.
- Preço inválido/negativo deve ser recusado; nome vazio deve cair no nome da cesta modelo.
- Personalização deve somar/subtrair somente os deltas dos produtos e preservar o complemento oculto congelado.

---

### Task 1: Testes de contrato do Admin e storefront

**Files:**
- Modify: `scripts/test-basket-kit-editor.mjs`
- Modify: `scripts/test-basket-carousel-service.mjs`

**Interfaces:**
- Consumes: fluxo atual de `basket_kit_lot_draft_save` e `home()` do `storefront-v2`.
- Produces: expectativas para `public_name`, `sale_price` e resolução comercial pelo lote ativo.

- [ ] Adicionar asserts que falham antes da implementação.
- [ ] Confirmar falha na CI da branch.

### Task 2: Persistência comercial por lote

**Files:**
- Create: `supabase/sql/20261003_basket_lot_commercial_fields_v1.sql`
- Create: `supabase/tests/basket_lot_commercial_fields_v1.sql`

**Interfaces:**
- Produces: `basket_stock_lots.public_name`; extensão de `save_basket_kit_lot_draft_v1`/`create_basket_kit_lot_v1`; views com nome/preço do lote; preservação do ajuste oculto no checkout dividido.

- [ ] Adicionar coluna e constraints aditivas.
- [ ] Calcular `component_sum_snapshot` e `hidden_adjustment_snapshot` no banco.
- [ ] Resolver nome/preço do lote ativo com fallback para a cesta modelo.
- [ ] Atualizar checkout dividido para começar pelo preço comercial do lote de alimentos e aplicar apenas deltas de personalização.
- [ ] Adicionar teste SQL de presença/contratos.

### Task 3: Admin e gateway

**Files:**
- Modify: `vitrine/admin/index.html`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`

**Interfaces:**
- Consumes: RPCs do Task 2.
- Produces: campos `public_name` e `sale_price` no criador de lote e payload do gateway.

- [ ] Mostrar Nome no site e Valor da cesta no editor do lote de alimentos.
- [ ] Preencher fallback com nome/preço atual da cesta e manter dados ao retomar/duplicar.
- [ ] Validar nome/preço antes de salvar.
- [ ] Encaminhar campos ao RPC sem ativar venda.

### Task 4: Storefront e verificação

**Files:**
- Modify: `supabase/functions/storefront-v2/index.ts`

**Interfaces:**
- Consumes: views enriquecidas do Task 2.
- Produces: nome e preço do lote ativo em home/detalhe, legacy e split.

- [ ] Usar `public_name` e `sale_price_override` com fallback para `basket_templates`.
- [ ] Rodar testes de cesta existentes e novos.
- [ ] Conferir diff e CI antes de merge/deploy.
