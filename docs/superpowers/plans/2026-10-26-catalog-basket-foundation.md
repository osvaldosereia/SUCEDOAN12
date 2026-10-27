# Catálogo e cestas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Preparar catálogo e cestas para Flow dinâmico com opções por componente, preço recalculável, fotos obrigatórias e dados financeiros isolados.

**Architecture:** Uma migration local evolui o schema do destino sem copiar registros. Custo e adicional interno ficam em `app_private`; tabelas públicas contêm apenas dados comerciais e têm grants acompanhados por RLS baseado no perfil ativo. Versões publicadas e seus componentes são imutáveis.

**Tech Stack:** Supabase local, PostgreSQL 17, migrations do Supabase CLI, Next.js TypeScript e tipos gerados pelo Supabase CLI.

**Spec:** `docs/planning/caderno-tecnico.md`, seções 9, 14.1, 14.2, 21.5, 21.6 e 22; matriz de papéis na seção 21.10.

## Global Constraints

- Não escrever em Supabase remoto, Meta ou Bling neste plano.
- Não importar linhas de cliente, produto ou integração para o local.
- Custo do produto e adicional interno da cesta nunca aparecem em tabelas públicas, Flow, ANA ou mensagem ao cliente.
- Cada tela/slot do Flow oferece opções ordenadas de produto e quantidade de 0 a 6; toda opção tem preço comercial próprio na versão da cesta, distinto do preço avulso.
- Não pré-selecionar opção nem quantidade. Quantidade 0 remove o slot; quantidade positiva exige uma alternativa; o carrinho da cesta precisa preencher pelo menos um slot.
- Todo produto publicado em cesta precisa de imagem verificada, miniatura Flow e texto alternativo.
- Somente `owner`, `admin` e `catalog_manager` administram o catálogo; `fulfillment` não recebe esse acesso.
- Toda tabela pública nova mantém RLS e grants explícitos; `app_private` não entra na Data API.

## Review Focus

- Custo existente é copiado para a tabela privada antes de sair de `public.products`.
- Atualizar o preço avulso de `products` não muda uma cesta publicada; o preço da cesta está na opção da versão imutável.
- Default privileges da role `postgres` continuam negando acesso futuro a `anon` e `authenticated`.
- `authenticated` sem perfil ou com perfil desabilitado não ganha política de catálogo.
- `fulfillment` não acessa tabelas de edição de catálogo, opções ou financeiros.
- Versão publicada/retirada não pode ter conteúdo alterado; rascunho permanece editável.
- Imagem verificada sem miniatura ou alt text não passa a ser aceita em novas gravações.

---

### Task 1: Separar financeiros e preparar publicação de produto

**Files:**
- Create: migration Supabase local `catalog_basket_foundation`.
- Modify: `public.products`, `public.product_images`.
- Create: `app_private.product_financials` e `public.meta_catalog_listings`.

**Interfaces:**
- `product_financials(product_id, cost_cents, updated_at)`; leitura/escrita somente para `service_role`.
- `meta_catalog_listings(waba_id, catalog_id, product_id, product_retailer_id, sync_status, synced_at, last_error_code)`; chave de retailer única por catálogo e produto único por catálogo.
- `product_images.flow_thumbnail_path`; imagens verificadas exigem miniatura e alt text.

- [x] Criar tabela financeira privada, copiar `products.cost_cents` nela e só depois remover a coluna/cHECK públicos.
- [x] Criar os mapeamentos Meta sem assumir que SKU ou GTIN equivalem a `product_retailer_id`.
- [x] Adicionar miniatura Flow e validação de imagem verificada sem invalidar linhas antigas; marcar constraint nova como `NOT VALID` até os arquivos serem revisados.

### Task 2: Modelar versões, componentes e alternativas da cesta

**Files:**
- Modify: migration local criada na Task 1.
- Create: `public.basket_template_versions`, `public.basket_components`, `public.basket_component_options` e `app_private.basket_version_financials`.

**Interfaces:**
- `basket_template_versions`: versão inteira por template, estado `draft | published | retired`, mínimo de componentes e auditoria de publicação.
- `basket_components`: rótulo, ordem, limite mínimo/máximo (máximo 6) e identificador estável do slot.
- `basket_component_options`: produtos alternativos ordenados por slot e `price_cents` comercial por unidade na cesta; o limite/quantidade pertence ao slot e quantidade 0 remove a escolha.
- `basket_version_financials(version_id, internal_extra_cents)` guarda o adicional interno fora do schema público.

- [x] Criar constraints/FKs/índices que impedem duplicar versão, slot ou opção no mesmo escopo.
- [x] Garantir por trigger privado que versões publicadas/retiradas e seus componentes, opções e adicional interno sejam imutáveis; somente rascunho publica e versão publicada pode ser retirada.

### Task 3: Autorizar edição do catálogo por papel

**Files:**
- Modify: migration local da Task 1.
- Modify: `public.products`, `public.product_images`, `public.product_identifiers`, `public.basket_templates` e novas tabelas públicas da cesta.
- Create: `app_private.current_staff_role()`.

**Interfaces:**
- Função estável `app_private.current_staff_role() RETURNS text`, `SECURITY DEFINER`, `SET search_path = ''`, retorna somente papel de perfil ativo.
- Policies usam essa função e limitam leitura/escrita a `owner`, `admin` e `catalog_manager`.
- `authenticated` recebe somente grants exigidos por essas policies; `anon` mantém apenas políticas de catálogo já existentes sem novo grant.

- [x] Manter `app_private` fora da Data API; conceder `USAGE/EXECUTE` do helper somente a `authenticated` e fazer a função negar perfil ausente/desabilitado.
- [x] Criar policies separadas de SELECT/INSERT/UPDATE/DELETE só para catálogo; não criar policy para clientes, pedidos, conversas ou tabelas financeiras.

### Task 4: Regenerar tipos e validar a migration local

**Files:**
- Modify: `src/lib/supabase/database.types.ts`.
- Modify: `docs/planning/caderno-tecnico.md`, `docs/planning/implementation-ledger.md`.

- [x] Aplicar `pnpm exec supabase db reset` apenas na stack local; todas as quatro migrations aplicam sem erro.
- [x] Inspecionar tabelas, RLS, policies, triggers e privilégios; leitura direta de custo e RPC anônima são negadas; `service_role` e staff autenticado têm os grants previstos.
- [x] Gerar os tipos `public` e executar `pnpm lint`, `pnpm typecheck` e `git diff --check`.
- [x] Registrar que `NOT VALID` exige validação após processamento das fotos; publicação do Flow fica bloqueada até produto e foto passarem os critérios.

## Decisões consolidadas após implementação

- `basket_component_options.price_cents` é o preço por unidade **dentro daquela versão da cesta**. `products.price_cents` continua sendo preço avulso; atualizar o preço avulso não muda uma cesta publicada. Alteração de preço da cesta cria nova versão draft.
- Slots não têm escolha pré-selecionada: quantidade 0 remove o slot; quantidade de 1 a 6 exige uma alternativa. A cesta exige pelo menos um slot com quantidade positiva para não formar pedido vazio.
- Toda alternativa usa a imagem verificada associada ao produto, com miniatura Flow e alt text. A publicação valida produtos ativos/aprovados, opções em cada slot e foto apta.
- A operação futura “Nova versão” duplica a última publicada (slots, alternativas, preços e adicional interno) em draft; pedidos e sessões antigas permanecem associados à versão original.
- Versões publicadas e retiradas, conteúdo dos slots/opções e adicional interno são imutáveis. Para deixar produto ou foto inelegível, primeiro é necessário retirar a versão da cesta.
- Custo e adicional interno ficam em `app_private`; staff autorizado usa RPCs estreitas que validam perfil ativo. Nenhum grant direto dessas tabelas é dado a `authenticated`.
- Migration local aplicada no banco resetável; Supabase destino `wvpzudjujtmyspluwhvx`, Meta e Bling permanecem sem escrita.
