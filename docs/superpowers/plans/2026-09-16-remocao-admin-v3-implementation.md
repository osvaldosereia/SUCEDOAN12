# Remoção completa do Admin V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `/admin/` o único Admin ativo, sem nenhuma dependência runtime, rota pública, chave de sessão, config ou Edge Function ativa com nome `admin-v3`.

**Architecture:** Migrar para `/admin/` somente o fechamento transitivo dos arquivos realmente usados pelas páginas oficiais, preservando comportamento. O frontend passa a usar nomes neutros e a sessão `da_admin_auth`; as Edge Functions administrativas ativas recebem nomes neutros equivalentes antes da retirada das antigas. A pasta `admin-v3/` só é excluída após testes específicos e suíte de regressão.

**Tech Stack:** HTML/CSS/JavaScript sem framework, GitHub Actions, Supabase Edge Functions, Node.js contract tests.

**Spec:** `docs/superpowers/specs/2026-09-16-remocao-admin-v3-design.md`

## Global Constraints

- O único endereço administrativo oficial é `/admin/`.
- O rótulo visual é `Admin`, nunca `Admin V3`.
- A sessão administrativa usa `da_admin_auth`.
- Nenhuma função existente do menu oficial pode desaparecer durante a limpeza.
- O Comprar não pode ser alterado funcionalmente por esta migração.
- Não apagar `admin-v3/` antes de existir teste final verde provando independência.
- Não trabalhar em `main`; usar `fix/admin-images-no-v3-20260916` / PR #364.

---

### Task 1: Contrato de independência do Admin

**Files:**
- Create: `scripts/test-admin-no-v3-runtime.mjs`
- Modify: `.github/workflows/test-admin-images-no-v3.yml`

**Interfaces:**
- Consumes: árvore `admin/` e arquivos ativos de configuração.
- Produces: teste que falha se HTML/JS/CSS do Admin contiver `/admin-v3/`, `../admin-v3/`, `DA_ADMIN_V3_CONFIG`, `da_admin_v3_auth` ou rótulo visual `Admin V3`.

- [ ] **Step 1: Write the failing test**

O teste deve percorrer recursivamente `admin/` e analisar `.html`, `.js`, `.css`, ignorando apenas comentários históricos explicitamente marcados. Deve também exigir a existência de `admin/imagens-ia.html`, `admin/pedidos.html`, `admin/inteligencia.html`, `admin/aprendizados.html`, `admin/atendimento.html` e `admin/nomes-produtos.html`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: FAIL listando referências atuais em `admin/index.html`, `admin/pedidos.html`, `admin/inteligencia.html`, `admin/aprendizados.html` e `admin/whatsapp-flow-key.html`, além das páginas ainda ausentes em `/admin/`.

- [ ] **Step 3: Wire the test into CI**

Adicionar o comando ao workflow dedicado do PR #364 para executar em cada push/PR que altere `admin/**`, `scripts/test-admin-no-v3-runtime.mjs` ou o próprio workflow.

- [ ] **Step 4: Commit**

Commit message: `test: exigir Admin sem dependências V3`.

---

### Task 2: Migrar shell principal e Pedidos

**Files:**
- Modify: `admin/index.html`
- Modify: `admin/pedidos.html`
- Modify: `admin/config.js`
- Create from active V3 equivalents: `admin/styles.css`, `admin/products-inline-controls-v4.css`, `admin/app.js`, `admin/api.js`, `admin/runtime-config.js`, `admin/orders-integrated-v2.js`, `admin/order-label-print-v1.js`, `admin/products-inline-controls-v4.js`, `admin/nav-fix.js`, `admin/basket-editor.js`, `admin/pedidos-v2.css`, `admin/pedidos-v2.js`

**Interfaces:**
- Consumes: mesmas APIs usadas hoje pelo Admin oficial.
- Produces: `admin/index.html` e `admin/pedidos.html` carregando somente assets locais de `/admin/`.

- [ ] **Step 1: Add focused assertions**

Estender `scripts/test-admin-no-v3-runtime.mjs` para exigir imports locais dos assets acima e impedir caminhos `/admin-v3/` nas duas páginas.

- [ ] **Step 2: Confirm RED**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: FAIL nas referências de shell/Pedidos.

- [ ] **Step 3: Migrate exact runtime files**

Copiar os arquivos ativos da pasta antiga mantendo nomes, exceto `config.js`, que vira `runtime-config.js` para não colidir com o config global existente. Em módulos ES, substituir `from './config.js'` por `from './runtime-config.js'` quando o contrato esperado for `export const CONFIG`.

- [ ] **Step 4: Normalize global config**

Remover `window.DA_ADMIN_V3_CONFIG` de `admin/config.js`; manter apenas `window.DA_ADMIN_CONFIG`.

- [ ] **Step 5: Run tests**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: shell e Pedidos deixam de aparecer como falhas; demais subpáginas ainda podem falhar.

- [ ] **Step 6: Commit**

Commit message: `refactor: mover shell e pedidos para Admin oficial`.

---

### Task 3: Migrar Inteligência, Aprendizados e chave WhatsApp Flow

**Files:**
- Modify: `admin/inteligencia.html`
- Modify: `admin/aprendizados.html`
- Modify: `admin/whatsapp-flow-key.html`
- Create: `admin/style.css`, `admin/mobile-priority.css`, `admin/admin-subpage-guard.js`, `admin/service-intelligence.css`, `admin/service-intelligence.js`, `admin/agent-learning.css`, `admin/agent-learning.js`

**Interfaces:**
- Consumes: `window.DA_ADMIN_CONFIG`, `da_admin_auth` e endpoints administrativos existentes.
- Produces: três subpáginas sem dependência de `admin-v3`.

- [ ] **Step 1: Add focused assertions**

Exigir que as três páginas usem somente `./...` e `DA_ADMIN_CONFIG` / `da_admin_auth`.

- [ ] **Step 2: Confirm RED**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: FAIL nas três páginas.

- [ ] **Step 3: Copy and normalize assets**

Copiar os assets necessários e substituir `DA_ADMIN_V3_CONFIG` por `DA_ADMIN_CONFIG` e `da_admin_v3_auth` por `da_admin_auth`.

- [ ] **Step 4: Update page references**

Trocar `../admin-v3/...` por assets locais `./...`.

- [ ] **Step 5: Run tests and syntax checks**

Run: `node scripts/test-admin-no-v3-runtime.mjs && node --check admin/service-intelligence.js && node --check admin/agent-learning.js`
Expected: PASS para este bloco.

- [ ] **Step 6: Commit**

Commit message: `refactor: mover inteligencia e aprendizados para Admin`.

---

### Task 4: Migrar Atendimento e Nomes dos produtos

**Files:**
- Create: `admin/atendimento.html`
- Create: `admin/service-strategy.css`, `admin/service-strategy.js`, `admin/service-chat-center.css`, `admin/chat-real-test.css`, `admin/chat-real-test.js`
- Create: `admin/nomes-produtos.html`, `admin/product-name-management.css`
- Modify: `admin/index.html`
- Modify: `admin/pedidos.html`

**Interfaces:**
- Consumes: Chat Comprar real, admin chat menu, intelligence rules e product-name automation.
- Produces: rotas locais `/admin/atendimento.html` e `/admin/nomes-produtos.html`.

- [ ] **Step 1: Add focused assertions**

Exigir as duas páginas locais e links do menu apontando para elas.

- [ ] **Step 2: Confirm RED**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: FAIL porque as rotas ainda apontam para a pasta antiga.

- [ ] **Step 3: Migrate Atendimento**

Copiar os cinco assets ativos e trocar import de `./config.js` por `./runtime-config.js` nos módulos ES; trocar `da_admin_v3_auth` por `da_admin_auth`; remover textos `Admin V3` da página.

- [ ] **Step 4: Migrate Nomes dos produtos**

Criar `admin/nomes-produtos.html` a partir da tela ativa. Manter funcionalidade, mas trocar rótulos/links públicos para `Admin`. A troca dos nomes de Edge Functions é feita na Task 5.

- [ ] **Step 5: Update menus**

Atualizar `admin/index.html` e `admin/pedidos.html` para apontar apenas para `./nomes-produtos.html` e `./atendimento.html`.

- [ ] **Step 6: Verify**

Run: `node scripts/test-admin-no-v3-runtime.mjs && node --check admin/service-strategy.js && node --check admin/chat-real-test.js`
Expected: PASS no frontend ativo.

- [ ] **Step 7: Commit**

Commit message: `refactor: mover atendimento e nomes para Admin`.

---

### Task 5: Neutralizar nomes V3 das Edge Functions ativas

**Files:**
- Create: `supabase/functions/admin-core-v1/index.ts` from deployed/source contract of `admin-v3-api`
- Create: `supabase/functions/admin-product-names-v1/index.ts` from `admin-v3-product-names`
- Modify: `admin/runtime-config.js`
- Modify: `admin/nomes-produtos.html`
- Add/update relevant function contract tests.

**Interfaces:**
- Produces: `admin-core-v1` com mesmo contrato de `admin-v3-api`; `admin-product-names-v1` com mesmo contrato de `admin-v3-product-names`.

- [ ] **Step 1: Write/extend contract tests**

Exigir que o frontend ativo não contenha strings `admin-v3-api` ou `admin-v3-product-names`.

- [ ] **Step 2: Confirm RED**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: FAIL somente nos endpoints antigos remanescentes.

- [ ] **Step 3: Clone functions without behavior change**

Copiar o código de produção/fonte atual para os dois nomes neutros, sem refatoração funcional.

- [ ] **Step 4: Deploy neutral functions**

Implantar `admin-core-v1` e `admin-product-names-v1` com as mesmas políticas de JWT das funções atuais.

- [ ] **Step 5: Switch frontend**

Atualizar `admin/runtime-config.js` e `admin/nomes-produtos.html` para os endpoints neutros.

- [ ] **Step 6: Verify live contracts**

Executar os testes de função aplicáveis e uma leitura segura de dashboard/listagem, sem mutações destrutivas.

- [ ] **Step 7: Commit**

Commit message: `refactor: renomear backend ativo do Admin`.

---

### Task 6: Auditoria final e exclusão de `admin-v3/`

**Files:**
- Modify: `scripts/test-admin-no-v3-runtime.mjs`
- Update/rename active workflows/tests whose runtime contract still points to `admin-v3/`.
- Delete: `admin-v3/**`

**Interfaces:**
- Produces: repositório sem diretório ativo `admin-v3/`.

- [ ] **Step 1: Strengthen final test**

Além de `admin/`, o teste deve examinar `.github/workflows/`, `scripts/` e `tests/` e falhar para referências runtime a `admin-v3/`, preservando apenas documentos históricos em `docs/`.

- [ ] **Step 2: Confirm RED**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: FAIL enquanto workflows/testes ativos ou a pasta antiga existirem.

- [ ] **Step 3: Update active CI contracts**

Trocar nomes/caminhos de testes relevantes para `/admin/`. Não reescrever documentação histórica.

- [ ] **Step 4: Delete directory**

Excluir `admin-v3/` somente após o frontend e os endpoints neutros estarem verificados.

- [ ] **Step 5: Run final contract**

Run: `node scripts/test-admin-no-v3-runtime.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `chore: remover Admin V3 legado`.

---

### Task 7: Regressão, PR e publicação

**Files:**
- Update: PR #364 body with final scope and verification evidence.

**Interfaces:**
- Produces: PR revisável, sem regressões conhecidas relacionadas à migração.

- [ ] **Step 1: Run relevant CI**

Required green checks: teste novo de independência, `Testar Imagens IA no Admin oficial`, `Testar Admin Dona Antônia`, `Testar Sala de Compra` e demais testes específicos das páginas migradas. Falhas preexistentes fora do escopo devem ser identificadas com evidência, não mascaradas.

- [ ] **Step 2: Inspect PR diff**

Confirmar que não houve mudança funcional acidental no Comprar nem exclusão de função administrativa ativa.

- [ ] **Step 3: Verify published assets after merge**

Somente após autorização de merge e deploy, verificar que `/admin/` serve os novos assets e que `/admin-v3/` não é mais dependência do Admin público.

- [ ] **Step 4: Finish branch**

Usar `superpowers:finishing-a-development-branch` antes de afirmar conclusão.
