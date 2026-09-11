# Admin V2 Operacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o Admin V2 com clientes completos, listagem de produtos inativos/revisão IA, acesso ao balanço rápido e reaproveitamento do fluxo automático EAN → pesquisa → imagem.

**Architecture:** Manter `admin/` como shell simples. Expandir `admin-simple-v2` somente para leitura/edição administrativa já existente e cadastro completo de clientes; não encaminhar escrita de estoque por esse endpoint. O balanço rápido continuará em `/contagem/`, usando os backends de inventário já existentes. A pesquisa de EAN e o pipeline de imagem continuam desacoplados e assíncronos.

**Tech Stack:** HTML/CSS/JavaScript, Supabase Edge Functions, PostgreSQL, GitHub Actions, Python/rembg.

**Spec:** `docs/superpowers/specs/2026-09-11-admin-v2-operacional-design.md`

## Global Constraints

- Não reintroduzir WhatsApp/Meta/IA conversacional no Admin 2.
- Não expor `service_role` no navegador.
- Não criar escrita pública de estoque no `admin-simple-v2`.
- Produtos da pesquisa EAN ficam inativos até revisão humana.
- Imagem padrão usa fundo `#ECECEC`.

---

### Task 1: Produtos completos e revisão IA

**Files:**
- Modify: `supabase/functions/admin-simple-v2/index.ts`
- Modify: `admin/app-lite.js`
- Modify: `admin/index.html`
- Test: `scripts/test-admin-simple-v2.mjs`

**Interfaces:**
- `products` aceita `status=active|inactive|ai-review|offer|no-stock`.
- Cada produto retorna `source_system` e `physically_verified`.

- [ ] Criar teste exigindo produtos não conferidos vindos de `ai_ean_research`/inventário.
- [ ] Remover o filtro global `physically_verified=true` e substituir por escopo de origens permitidas.
- [ ] Adicionar filtros e badge `REVISÃO IA` no Admin.
- [ ] Rodar testes de contrato.
- [ ] Commit.

### Task 2: Cliente completo + Google Maps

**Files:**
- Modify: `supabase/functions/admin-simple-v2/index.ts`
- Modify: `admin/app-lite.js`
- Test: `scripts/test-admin-simple-v2.mjs`
- Create: `supabase/migrations/20260911_admin_v2_customer_maps.sql` somente se a coluna ainda não existir.

**Interfaces:**
- `customer` retorna endereço principal + `google_maps_url`.
- `save_customer` aceita `postal_code, street, number, complement, neighborhood, city, state, reference, google_maps_url`.

- [ ] Inspecionar schema atual e evitar migração se o campo já existir.
- [ ] Criar teste de contrato para endereço completo e link do Maps.
- [ ] Persistir endereço principal por upsert controlado.
- [ ] Renderizar campos e botão `Abrir no Google Maps`, usando link salvo ou consulta pelo endereço.
- [ ] Rodar testes.
- [ ] Commit.

### Task 3: Balanço rápido no Admin 2

**Files:**
- Modify: `admin/index.html`
- Modify: `admin/app-lite.js`
- Modify: `admin/simple.css`
- Test: `scripts/test-admin-no-auth-v2.mjs`

**Interfaces:**
- Menu `Balanço rápido` abre `../contagem/` em fluxo dedicado.
- Nenhuma ação de estoque passa por `admin-simple-v2`.

- [ ] Criar teste exigindo a entrada `Balanço rápido` e proibindo `balance_scan` no endpoint público.
- [ ] Adicionar cartão explicativo e botão para abrir a ferramenta existente.
- [ ] Garantir layout mobile.
- [ ] Rodar testes.
- [ ] Commit.

### Task 4: Verificação EAN → pesquisa → imagem

**Files:**
- Verify: `supabase/functions/inventory-product-research-v1/index.ts`
- Verify: `automation/product-image-studio/enrich_researched_products.py`
- Verify: `.github/workflows/product-image-studio-production.yml`
- Test: existing inventory/product image tests.

**Interfaces:**
- EAN desconhecido cria fila em `unresolved_product_eans`.
- Pesquisa cria produto `source_system='ai_ean_research'`, `is_active=false`.
- Imagem final usa fundo `#ECECEC` e atualiza `products.image_url`.

- [ ] Rodar verificações de contrato/estado.
- [ ] Confirmar cron de pesquisa e workflow de imagem ativos no código.
- [ ] Não alterar o pipeline se os contratos estiverem corretos.

### Task 5: Verificação integrada

**Files:**
- Test: `.github/workflows/test-admin-v3.yml`
- Test: scripts relacionados a contagem e pesquisa.

- [ ] Rodar testes estáticos e de contrato disponíveis localmente/CI.
- [ ] Consultar Supabase para confirmar schema de clientes, produtos em revisão e jobs de pesquisa.
- [ ] Implantar a versão atualizada de `admin-simple-v2` somente após testes.
- [ ] Abrir PR de teste com resumo das mudanças e riscos conhecidos.
