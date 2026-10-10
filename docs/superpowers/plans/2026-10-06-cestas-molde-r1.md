# Cestas Molde R1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a base transacional e segura do novo domínio Cesta Molde → Posições → Opções de Produto, incluindo valor oculto fixo e quantidade pública configurável de 1 a 4 composições.

**Architecture:** Manter `basket_templates` como identidade comercial existente e criar uma extensão 1:1 em `basket_molds`. Posições e opções ficam em tabelas próprias, isoladas das tabelas de estoque/lotes. A escrita administrativa ocorre por RPC transacional `save_basket_mold_v1`; a leitura por `basket_mold_editor_v1`, ambas acessíveis somente por `service_role`.

**Tech Stack:** PostgreSQL/Supabase, SQL migrations, Node.js contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-cestas-molde.md`

## Global Constraints

- Não alterar checkout, pedidos, estoque, reservas ou lotes nesta rodada.
- `public_composition_count` aceita exatamente 1, 2, 3 ou 4.
- Cada posição exige quantidade > 0 e pelo menos uma opção.
- Produto duplicado na mesma posição é inválido.
- Novas tabelas em `public` terão RLS habilitado e acesso negado a `anon` e `authenticated`.
- Operações administrativas do novo domínio serão `service_role only`.
- Não migrar automaticamente as cestas atuais nesta rodada.

## Review Focus

- `public_composition_count` fora de 1–4 deve falhar sem gravar parcialmente.
- Posição vazia ou sem opções deve falhar sem gravar parcialmente.
- Opção duplicada na mesma posição deve falhar.
- Produto inexistente deve falhar por integridade referencial.
- Salvar um molde novamente deve substituir somente posições/opções daquele molde, sem tocar em estoque/lotes.

---

### Task 1: Contracto RED do domínio

**Files:**
- Create: `scripts/test-basket-mold-domain-v1.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Produces: contrato estático da migration `20261006_basket_mold_domain_v1.sql`.

- [ ] **Step 1: Write the failing test**
  - Exigir tabelas `basket_molds`, `basket_mold_positions`, `basket_mold_position_options`.
  - Exigir check `public_composition_count between 1 and 4`.
  - Exigir FKs para `basket_templates` e `products`.
  - Exigir RLS nas três tabelas.
  - Exigir RPCs `basket_mold_editor_v1` e `save_basket_mold_v1`.
  - Exigir `revoke all ... from public,anon,authenticated` e grants apenas a `service_role`.
  - Exigir ausência de DML contra `basket_stock_lots`, `basket_stock_reservations`, `orders` e `order_items`.

- [ ] **Step 2: Run CI and verify RED**
  - Expected: novo teste falha porque a migration ainda não existe.

### Task 2: Persistência e leitura do molde

**Files:**
- Create: `supabase/sql/20261006_basket_mold_domain_v1.sql`
- Create: `supabase/migrations/20261006060000_basket_mold_domain_v1.sql`

**Interfaces:**
- Produces tables:
  - `public.basket_molds(id uuid, basket_id uuid unique, hidden_adjustment numeric, public_composition_count smallint, metadata jsonb, created_at, updated_at)`
  - `public.basket_mold_positions(id uuid, mold_id uuid, label text, quantity numeric, sort_order int, metadata jsonb, created_at, updated_at)`
  - `public.basket_mold_position_options(id uuid, position_id uuid, product_id uuid, sort_order int, metadata jsonb, created_at, updated_at)`
- Produces functions:
  - `public.basket_mold_editor_v1(p_basket_id uuid) returns jsonb`
  - `public.save_basket_mold_v1(p_basket_id uuid, p_hidden_adjustment numeric, p_public_composition_count integer, p_positions jsonb, p_operator text default null) returns jsonb`

- [ ] **Step 1: Implement minimal schema**
  - Tabelas com constraints e índices únicos necessários.
  - RLS enabled; no policies for client roles.
  - Explicit revokes/grants.

- [ ] **Step 2: Implement editor RPC**
  - Retornar molde, posições ordenadas e opções ordenadas com identidade do produto.
  - `security invoker`, `service_role only`.

- [ ] **Step 3: Implement save RPC**
  - Validar basket existente, count 1–4, array de posições não vazio, quantidade > 0 e opções não vazias.
  - Upsert 1:1 de `basket_molds`.
  - Substituir posições/opções apenas do molde alvo dentro da mesma transação da função.
  - Rejeitar opção duplicada por posição.
  - Não tocar em tabelas de estoque/pedidos.

- [ ] **Step 4: Run contract test and verify GREEN**

### Task 3: Validar no Supabase canônico

**Files:**
- No additional code expected.

**Interfaces:**
- Consumes migration from Task 2.
- Produces verified runtime schema for R2.

- [ ] **Step 1: Apply the migration**
  - Usar `apply_migration` para a migration final revisada.

- [ ] **Step 2: Verify schema/security**
  - Confirmar RLS habilitado.
  - Confirmar grants de tabelas/funções: `service_role` permitido, `anon/authenticated` não.

- [ ] **Step 3: Run transactional smoke with rollback**
  - Escolher uma cesta existente somente para o teste.
  - Criar molde + uma posição + uma opção dentro de `BEGIN ... ROLLBACK` via RPC/SQL equivalente.
  - Confirmar leitura correta.
  - Confirmar count inválido (`5`) falha.
  - Confirmar ausência de resíduos após rollback.

### Task 4: Regressão e integração

**Files:**
- Modify PR description/checkpoint only if needed.

**Interfaces:**
- Produces branch ready for R2.

- [ ] **Step 1: Run full Basket kit editor CI**
  - Expected: success.

- [ ] **Step 2: Review changed files against constraints**
  - Nenhum arquivo de checkout/storefront/stock allocation deve mudar.

- [ ] **Step 3: Merge only after green evidence**
  - Verify current `main` has not diverged in conflicting basket-domain files.
