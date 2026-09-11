# WhatsApp Meta Legacy Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apagar do sistema Dona Antônia toda infraestrutura própria de atendimento WhatsApp/Meta/IA, preservando apenas o link comum `wa.me` usado depois que um pedido da Vitrine V2 já foi salvo.

**Architecture:** Primeiro cortar todas as referências ativas; depois provar por busca/testes que os arquivos são órfãos; então excluir UI, Edge Functions, workers, webhooks, scripts de teste e configurações exclusivas do atendimento antigo. Migrações históricas permanecem como histórico do banco, mas uma nova migração de limpeza remove objetos ativos exclusivamente ligados ao atendimento quando isso for seguro e confirmado no schema real.

**Tech Stack:** GitHub, Supabase Postgres/Edge Functions, JavaScript/TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-11-vitrine-v2-admin-simple-design.md`

## Global Constraints

- Preservar produtos, cestas, clientes, pedidos e dados comerciais.
- Preservar telefone como dado cadastral.
- Preservar somente abertura comum de WhatsApp (`wa.me`) após pedido salvo; isso não é integração Meta API.
- Não manter hooks mortos para CI legado.
- Não apagar tabela/função do banco sem confirmar dependências reais.

---

### Task 1: Inventário de legado e teste de ausência ativa

**Files:**
- Create: `scripts/test-no-whatsapp-meta-runtime-v2.mjs`
- Create: `docs/superpowers/plans/whatsapp-meta-removal-inventory.md`

**Interfaces:**
- Produces: lista classificada `delete`, `keep`, `review`.

- [ ] **Step 1: Buscar referências**

```bash
git grep -niE 'whatsapp|meta|conversation-worker|human-copilot|inbox|flow' -- ':!docs/**' ':!supabase/migrations/**'
```

- [ ] **Step 2: Classificar como KEEP apenas telefone cadastral, texto do botão final e `wa.me` da Vitrine V2**
- [ ] **Step 3: Classificar como DELETE tudo que implementa Meta API, webhook, Flow, inbox, conversa, agente, IA, handoff ou resposta automática**
- [ ] **Step 4: Criar teste que falha se Admin/root carregarem arquivos proibidos**
- [ ] **Step 5: Commit do inventário/teste**

### Task 2: Remover UI e páginas antigas

**Files candidatos após confirmação de dependência:**
- Delete: `admin/inteligencia.html`
- Delete: `admin/whatsapp-flow-key.html`
- Delete: `admin-v3/whatsapp-ops.js`
- Delete: `admin-v3/human-service-center.js`
- Delete: CSS correspondentes de atendimento, se órfãos.
- Delete/retirar da produção: diretório `atendimento/` se exclusivo do sistema abandonado.

- [ ] **Step 1: Confirmar que nenhum arquivo mantido importa os candidatos**
- [ ] **Step 2: Excluir candidatos comprovadamente exclusivos**
- [ ] **Step 3: Rodar `node scripts/test-no-whatsapp-meta-runtime-v2.mjs`**
- [ ] **Step 4: Commit**

### Task 3: Remover Edge Functions/workers do atendimento antigo

**Files candidatos após confirmação:**
- `supabase/functions/admin-whatsapp-ops-v1/`
- `supabase/functions/admin-human-copilot-v1/`
- `supabase/functions/admin-chat-menu-v1/`
- `supabase/functions/admin-agent-learning-v1/`
- funções `whatsapp-*`, `conversation-worker-*`, Flow/webhook e orquestradores exclusivos do atendimento.
- Modify: `supabase/config.toml`

- [ ] **Step 1: Listar todas as funções configuradas e referências em workflows/scripts**
- [ ] **Step 2: Confirmar que Storefront V2/Admin Simple não dependem delas**
- [ ] **Step 3: Remover diretórios e seções do `config.toml`**
- [ ] **Step 4: Remover deploy workflows exclusivos dessas funções**
- [ ] **Step 5: Rodar `deno check` das funções restantes relevantes**
- [ ] **Step 6: Commit**

### Task 4: Remover testes e workflows que exigem o sistema antigo

**Files candidatos:**
- `scripts/whatsapp-operational-release-v1.test.mjs`
- `scripts/test-whatsapp-*.mjs` ligados a Meta/Flow/atendimento antigo
- `scripts/test-unified-crm-inbox-v1.mjs`
- `scripts/test-human-service-center-v1.mjs`
- workflows cuja única finalidade seja deploy/test do atendimento abandonado.

- [ ] **Step 1: Não apagar testes de comportamento comercial ainda usado na Vitrine V2; migrá-los para novos contratos quando aplicável**
- [ ] **Step 2: Apagar testes exclusivamente do legado**
- [ ] **Step 3: Atualizar CI para Admin Simple + Storefront V2 + backend**
- [ ] **Step 4: Confirmar que falhas antigas não forçam reintrodução de hooks removidos**
- [ ] **Step 5: Commit**

### Task 5: Limpeza segura do banco

**Files:**
- Create via CLI: `supabase migration new remove_whatsapp_meta_runtime`
- Create: `docs/superpowers/plans/whatsapp-meta-db-dependency-audit.md`

- [ ] **Step 1: Consultar tabelas/views/functions/triggers com nomes e dependências do legado**
- [ ] **Step 2: Registrar quais objetos contêm dados históricos versus somente runtime descartável**
- [ ] **Step 3: Manter dados históricos que tenham valor comercial/legal; remover somente runtime sem uso**
- [ ] **Step 4: Criar a migração pelo CLI, nunca inventar timestamp**
- [ ] **Step 5: `DROP` em ordem de dependência apenas dos objetos confirmados como exclusivos**
- [ ] **Step 6: Rodar advisors e testes de Produtos/Cestas/Clientes/Pedidos após a migração**
- [ ] **Step 7: Commit**

### Task 6: Corte da vitrine antiga

**Files:**
- Modify: raiz pública (`index.html` e imports) para apontar à Vitrine V2 homologada.
- Remover depois de provar órfãos: `cesta/whatsapp-return.js`, `basket-shop-v1` e módulos antigos de checkout/Firebase/Make usados somente pela vitrine substituída.

- [ ] **Step 1: Publicar/homologar `vitrine-v2/` sem alterar raiz**
- [ ] **Step 2: Executar smoke test completo**
- [ ] **Step 3: Fazer corte da raiz**
- [ ] **Step 4: Buscar referências órfãs e excluir módulos antigos não compartilhados por outros projetos do repositório**
- [ ] **Step 5: Preservar apenas `wa.me` do botão final da nova vitrine**
- [ ] **Step 6: Commit**

### Task 7: Verificação final

- [ ] **Step 1:** `git grep` não encontra Meta API, webhook, Flow, inbox, conversation-worker ou IA de atendimento em runtime ativo.
- [ ] **Step 2:** Admin mostra somente Produtos, Cestas básicas e Clientes.
- [ ] **Step 3:** Vitrine cria pedido sem cadastro e com cadastro.
- [ ] **Step 4:** WhatsApp só é aberto depois do pedido persistido.
- [ ] **Step 5:** nenhum request de produção vai para Graph API/Meta.
- [ ] **Step 6:** CI principal fica verde com os novos contratos.
