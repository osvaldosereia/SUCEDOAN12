# Chat Deterministic Query Engine V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Chat Comprar responder combinações comerciais de cestas e produtos com dados reais, sem IA por padrão.

**Architecture:** Adicionar um parser local de intenção/entidades e dois resolvedores estruturados (cestas e produtos) antes dos atalhos genéricos e antes do fallback de IA. Consultas usam Supabase filtrado; contexto curto reaproveita o último tópico da própria conversa sem histórico longo.

**Tech Stack:** Supabase Edge Functions/Deno/TypeScript, PostgreSQL, GitHub Actions, Node contract tests.

**Spec:** `docs/superpowers/specs/2026-09-14-chat-deterministic-query-engine-v2-design.md`

## Global Constraints

- IA generativa permanece desligada.
- Classificador IA só pode ser último fallback e deve respeitar toggle OpenAI.
- Não usar embeddings nem banco vetorial.
- Não habilitar WhatsApp workers/handoff humano.
- Produtos elegíveis: `physically_verified=true`, `is_active=true`, `stock>0`.
- Respeitar toggles atuais de Cestas, Produtos, Ofertas, Checkout e OpenAI.
- Consultas devem ser pequenas, limitadas e orientadas pelos dados reais.

---

### Task 1: Contrato de regressão combinatória

**Files:**
- Create: `tests/chat-deterministic-query-engine-v2.mjs`
- Modify: `.github/workflows/test-shopping-room.yml`

**Interfaces:**
- Consumes: `supabase/functions/shopping-chat-v1/index.ts`
- Produces: contrato estático exigindo parser/resolvedores e matriz >=100 perguntas.

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
const chat=fs.readFileSync('supabase/functions/shopping-chat-v1/index.ts','utf8');
assert.match(chat,/parseDeterministicQuery/);
assert.match(chat,/resolveBasketQuery/);
assert.match(chat,/resolveCatalogQuery/);
assert.match(chat,/readRecentRoutingContext/);
for(const phrase of ['maior cesta','mais cara','2 arroz','sem material de limpeza','qual café você tem']) {
  assert.ok(chat.toLowerCase().includes(phrase.split(' ')[0]));
}
const cases=[/* 100+ frases concretas */];
assert.ok(cases.length>=100);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: FAIL porque as novas funções ainda não existem.

- [ ] **Step 3: Add the contract test to CI**

Adicionar ao workflow:

```yaml
- name: Motor determinístico V2
  run: node tests/chat-deterministic-query-engine-v2.mjs
```

- [ ] **Step 4: Commit**

```bash
git add tests/chat-deterministic-query-engine-v2.mjs .github/workflows/test-shopping-room.yml
git commit -m "test: cobrir consultas determinísticas combinatórias"
```

### Task 2: Parser local e sinônimos

**Files:**
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Test: `tests/chat-deterministic-query-engine-v2.mjs`

**Interfaces:**
- Produces: `parseDeterministicQuery(message:string, context:any): ParsedQuery`
- `ParsedQuery` contém `domain`, `operation`, `budget`, `quantity`, `includeTerms`, `excludeTerms`, `productTerms`, `brandTerms`, `packageTerms`, `topic`.

- [ ] **Step 1: Extend the failing test**

Exigir no código as operações `largest`, `most_expensive`, `cheapest`, `contains_quantity`, `exclude`, `list_products` e sinônimos `material de limpeza -> limpeza_lavanderia`.

- [ ] **Step 2: Run the test and confirm failure**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: FAIL nas novas asserções.

- [ ] **Step 3: Implement minimal parser**

Implementar normalização sem acentos, números, orçamento, padrões `com N X`, `pelo menos N X`, `sem X`, comparativos e embalagem (`500g`, `1l`, `2 litros`). Não consultar OpenAI.

- [ ] **Step 4: Run test**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: PASS do parser/contrato.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/shopping-chat-v1/index.ts tests/chat-deterministic-query-engine-v2.mjs
git commit -m "feat: interpretar consultas comerciais sem IA"
```

### Task 3: Resolvedor estruturado de cestas

**Files:**
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Test: `tests/chat-deterministic-query-engine-v2.mjs`

**Interfaces:**
- Consumes: `ParsedQuery`
- Produces: `resolveBasketQuery(sb, parsed, flags)` com resposta `source:'basket_query'`, `ai_used:false`, `mode:'baskets'`.

- [ ] **Step 1: Add failing basket assertions**

Cobrir:

```text
Qual a maior cesta?
Qual a mais cara?
Quero uma cesta com 2 arroz
Tem cesta sem material de limpeza?
Qual cesta tem mais arroz?
Qual cesta mais barata com pelo menos 3 arroz?
Quero uma cesta até 300 reais sem produto de limpeza
```

- [ ] **Step 2: Verify red**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement basket aggregation**

Consultar `basket_templates` e `basket_template_items` com `products(id,name,brand,category,sales_category)`, agregar quantidade total e por termos/categoria, filtrar orçamento/inclusão/exclusão e ordenar conforme operação. Limitar às cestas ativas.

- [ ] **Step 4: Verify green**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/shopping-chat-v1/index.ts tests/chat-deterministic-query-engine-v2.mjs
git commit -m "feat: responder consultas combinadas de cestas"
```

### Task 4: Resolvedor estruturado de produtos

**Files:**
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Test: `tests/chat-deterministic-query-engine-v2.mjs`

**Interfaces:**
- Consumes: `ParsedQuery`
- Produces: `resolveCatalogQuery(sb, parsed, flags)` com `source:'catalog_query'`, `ai_used:false`, `mode:'product_lookup'` ou `products`.

- [ ] **Step 1: Add failing catalog assertions**

Cobrir:

```text
Qual café você tem?
Quais cafés de 500g vocês têm?
Tem Pilão?
Qual café mais barato?
Qual amaciante Downy mais barato?
Tem leite Piracanjuba 1L?
Quero detergente de 500ml
```

- [ ] **Step 2: Verify red**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement catalog resolver**

Buscar somente ativos/verificados/com estoque. Filtrar primeiro por termos específicos em `name`/`brand`/`packaging`; usar categoria apenas como fallback. Para “café”, manter `name ILIKE '%café%'`, evitando abrir toda `CAFÉ DA MANHÃ`. Para comparativos, ordenar localmente o pequeno conjunto retornado por `price`.

- [ ] **Step 4: Verify green**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/shopping-chat-v1/index.ts tests/chat-deterministic-query-engine-v2.mjs
git commit -m "feat: responder consultas estruturadas de produtos"
```

### Task 5: Contexto curto e ordem de roteamento

**Files:**
- Modify: `supabase/functions/shopping-chat-v1/index.ts`
- Test: `tests/chat-deterministic-query-engine-v2.mjs`

**Interfaces:**
- Produces: `readRecentRoutingContext(sb, conversationId)` retornando somente tópico/entidade/filtros recentes necessários.
- `routeChatMessage` recebe contexto e executa regra explícita -> query engine -> deterministic -> product lookup -> IA -> fallback.

- [ ] **Step 1: Add failing routing/context assertions**

Garantir que “Quais cestas vocês têm?” seguido de “qual a mais cara?” resolve cesta sem IA, e que toggles desligados impedem resolvedores correspondentes.

- [ ] **Step 2: Verify red**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement recent context**

Ler no máximo as últimas mensagens outbound/inbound da conversa e extrair apenas `ai_interpretation.routing.topic/entity/filters`. Persistir esses campos no reply roteado. Não enviar histórico completo para IA.

- [ ] **Step 4: Verify green**

Run: `node tests/chat-deterministic-query-engine-v2.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/shopping-chat-v1/index.ts tests/chat-deterministic-query-engine-v2.mjs
git commit -m "feat: usar contexto curto no motor determinístico"
```

### Task 6: Validação completa, deploy e smoke

**Files:**
- Modify only if a regression is found.

**Interfaces:**
- Produces: `shopping-chat-v1` nova versão em produção e PR pronto para merge.

- [ ] **Step 1: Run complete CI-equivalent tests**

Run the repository checks triggered by `Testar Sala de Compra` and `Admin V3 Chat Comprar` plus:

```bash
node tests/chat-deterministic-query-engine-v2.mjs
```

Expected: all PASS.

- [ ] **Step 2: Deploy Edge Function preserving auth mode**

Deploy `shopping-chat-v1` with `verify_jwt=false`, matching current production configuration.

- [ ] **Step 3: Smoke production**

Testar pelo endpoint real pelo menos:

```text
Qual a maior cesta?
Qual a mais cara?
Quero uma cesta com 2 arroz
Tem cesta sem material de limpeza?
Qual café você tem?
Quais cafés de 500g vocês têm?
Qual amaciante Downy mais barato?
```

Expected: HTTP 200, `ai_used=false`, modo coerente e respostas baseadas no banco.

- [ ] **Step 4: Verify IA remains fallback-only**

Consultar runtime e confirmar `generative_ai_enabled=false`; não alterar gates legados.

- [ ] **Step 5: Open PR and merge only after green checks**

PR contra `main` com resumo das consultas suportadas e evidência de smoke.