# Cestas Mounted Lots, Printing and Editable Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar modelos e lotes de cestas/kit editáveis com estados claros, impressão A4 e carregamento mais leve, preservando estoque e histórico.

**Architecture:** Reutilizar o editor de lote já existente. Lote `draft` passa a ser apresentado como “Em edição”; lote `ready` ainda não usado pode ser reaberto atomicamente para `draft` por RPC e depois novamente “Marcar como montado” usando o RPC de ativação existente. Modelos são atualizados/arquivados por RPCs administrativos e a UI imprime o lote salvo diretamente no navegador. A listagem elimina o RPC N+1 de próximo código calculando o código a partir dos lotes já carregados.

**Tech Stack:** Supabase/Postgres, Supabase Edge Functions (Deno/TypeScript), HTML/CSS/JavaScript do Vitrine/Admin, Node assertions + Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-04-baskets-mounted-edit-print-models.md`

## Global Constraints

- Projeto Supabase canônico: `ssbesxgaijknwsjbsbcz`.
- Repositório: `osvaldosereia/SUCEDOAN12`.
- Montar lote não ativa venda no site.
- Nenhum lote com histórico de pedido pode ter composição reescrita.
- Exclusão de modelos é arquivamento lógico (`is_active=false`).
- EB1 da Econômica Bonini permanece em edição até ação humana explícita.
- Impressão A4 não persiste arquivo nem altera o banco.

## Review Focus

- Reabertura de lote ativo no site deve falhar sem alterar estoque.
- Reabertura de lote com qualquer alocação/histórico deve falhar.
- Arquivamento de modelo com lote dependente deve falhar.
- Salvar modelo com produto duplicado/inativo ou quantidade inválida deve falhar.
- Próximo código deve continuar correto com lotes `draft` e `ready`, sem consulta por modelo.

---

### Task 1: Contratos e regressões

**Files:**
- Create: `scripts/test-basket-mounted-edit-print-models.mjs`
- Modify: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Produces: assertions que fixam nomes de ações/RPCs e UX dos Tasks 2–4.

- [ ] **Step 1: Write the failing contract test**
  - Exigir RPC `reopen_basket_kit_lot_for_edit_v1`.
  - Exigir ações API `basket_kit_lot_reopen`, `basket_kit_template_save`, `basket_kit_template_archive`, `basket_archive`.
  - Exigir UI “Marcar como montado”, “Editar lote”, “Imprimir lote”, `printBasketKitLot`, A4 retrato e grid de 4 colunas.
  - Exigir nome/valor na linha de lote montado e botões de editar/excluir modelo.
  - Exigir ausência de `await db.rpc("next_basket_kit_short_code_v1"` dentro de `basketKitsAdmin`.
- [ ] **Step 2: Run in CI and verify RED**
  - Expected: falhar porque os novos contratos ainda não existem.
- [ ] **Step 3: Commit test contracts**

### Task 2: Estado do lote, edição segura e carregamento

**Files:**
- Create: `supabase/sql/20261004_basket_lot_reopen_and_model_admin_v1.sql`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-basket-mounted-edit-print-models.mjs`
- Test: `scripts/test-basket-kit-editor.mjs`

**Interfaces:**
- Produces: RPC `reopen_basket_kit_lot_for_edit_v1(uuid,text) -> jsonb`; API `basket_kit_lot_reopen`; UI `reopenBasketKitLot(lotId)`.
- Consumes: ativação já existente `basket_kit_lot_draft_activate`.

- [ ] **Step 1: Add failing runtime/editor assertions**
  - Draft salvo aparece como “Em edição” e oferece `data-kit-lot-mount`.
  - Ready não usado oferece `Editar lote`; ação chama `basket_kit_lot_reopen` e retoma o mesmo `lot_id` como draft.
- [ ] **Step 2: Implement reopen RPC with guards**
  - Bloquear venda ativa, histórico/alocação, quantidade já consumida/desmontada e lote pronto dependente.
  - Atualizar `ready -> draft`, `quantity_available=0`, `sale_enabled=false`, preservando ID e composição.
- [ ] **Step 3: Implement API + UI state transitions**
  - “Marcar como montado” usa ativação existente e nunca ativa venda.
  - Mostrar KPIs separados `Montados` e `Em edição`.
- [ ] **Step 4: Remove list N+1**
  - Calcular próximo código por kit a partir dos lotes já carregados; manter um único RPC no detalhe se necessário.
- [ ] **Step 5: Run basket test suite**
  - Expected: PASS.

### Task 3: Impressão A4 e informações dos lotes

**Files:**
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-basket-mounted-edit-print-models.mjs`

**Interfaces:**
- Produces: `printBasketKitLot(lotId)`.

- [ ] **Step 1: Add failing print assertions**
  - A4 portrait, 4 colunas, cards verticais, foto/nome/quantidade, cabeçalho com nome/código/valor/quantidade.
- [ ] **Step 2: Implement browser print view**
  - Abrir janela de impressão a partir do objeto de lote já carregado; sem mutação de dados.
- [ ] **Step 3: Show public name and sale value prominently on mounted lots**
- [ ] **Step 4: Run tests**
  - Expected: PASS.

### Task 4: Modelos de kit/cesta editáveis e excluíveis

**Files:**
- Modify: `supabase/sql/20261004_basket_lot_reopen_and_model_admin_v1.sql`
- Modify: `supabase/functions/admin-products-live-v1/index.ts`
- Modify: `vitrine/admin/index.html`
- Test: `scripts/test-basket-mounted-edit-print-models.mjs`

**Interfaces:**
- Produces: RPCs `save_basket_kit_template_admin_v1`, `archive_basket_kit_template_admin_v1`, `archive_basket_template_admin_v1`; API actions correspondentes.

- [ ] **Step 1: Add failing model CRUD assertions**
- [ ] **Step 2: Implement kit template save RPC**
  - Validar nome, prefixo `AA`, 1–120 itens, produtos ativos, produtos únicos, quantidades 1–100; substituir composição atomicamente.
- [ ] **Step 3: Implement safe archive RPCs**
  - Kit: bloquear se houver `draft` ou `ready` disponível.
  - Cesta: bloquear se houver kit ativo ou lote `draft`/`ready` disponível.
- [ ] **Step 4: Implement API actions and UI editors**
  - Modelo de kit: editar nome/prefixo/composição, adicionar/trocar/remover item, salvar e excluir modelo.
  - Modelo de cesta: manter edição existente e adicionar “Excluir modelo”.
- [ ] **Step 5: Run tests**
  - Expected: PASS.

### Task 5: Validação integrada e entrega

**Files:**
- Modify if needed: `.github/workflows/basket-kit-editor-ci.yml`

**Interfaces:**
- Consumes: all tasks.

- [ ] **Step 1: Run full Basket kit editor GitHub Actions suite**
  - Expected: all jobs PASS.
- [ ] **Step 2: Apply SQL migration to Supabase and deploy `admin-products-live-v1`**
- [ ] **Step 3: Verify database state read-only**
  - EB1 remains `draft`, quantity 4, public name/value preserved.
  - No automatic stock reservation is performed.
- [ ] **Step 4: Run security/performance advisors and targeted smoke checks**
- [ ] **Step 5: Review diff, merge only after green CI and final verification**
