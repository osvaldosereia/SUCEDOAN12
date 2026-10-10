# Marketing PapoAI-like UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar o Marketing do Vitrine/Admin para um fluxo operacional próximo dos prints do PapoAI, com Templates, Campanhas, público `Todos os clientes`/`Por etiquetas`, carrossel e relatório simples, preservando o backend já homologado.

**Architecture:** Manter as Edge Functions, worker, snapshots, outbox e gates atuais como fonte canônica. Refatorar a experiência por módulos pequenos no frontend, escondendo complexidade técnica e adicionando apenas contratos backend faltantes para carrossel/relatório. A UI nunca chama Meta Graph diretamente.

**Tech Stack:** JavaScript modular no Admin, CSS existente do Vitrine/Admin, Supabase Edge Functions/SQL, Meta Cloud API por transporte server-side existente, GitHub Actions/Node contracts.

**Spec:** `docs/superpowers/specs/2026-10-05-marketing-papoai-like-ux-design.md`

## Global Constraints

- Navegação principal: `Visão geral | Templates | Campanhas | Públicos`; Consentimentos sai do fluxo principal.
- Fluxo comum de campanha: `+ Novo → canal → template → Todos os clientes/Por etiquetas → agora/agendar → criar`.
- `Todos os clientes` usa filtros comerciais vazios; `Por etiquetas` usa `label_ids` e deduplicação canônica.
- Filtros avançados ficam recolhidos por padrão.
- UUID, WAMID, snapshot, dispatch e outbox não aparecem no uso comum.
- PapoAI permanece inbound para 0975/1018; não remover integração nesta mudança.
- Nenhuma chamada direta à Meta Graph no navegador.
- Gates server-side de telefone, dedupe, cliente ativo, opt-out/consentimento, template, canal e runtime permanecem intactos.
- Campanhas não são graduadas automaticamente para live por esta refatoração.
- Visual usa tokens e componentes existentes do Vitrine/Admin.

## Review Focus

- Base inteira com centenas de clientes: a UI deve mostrar total selecionado sem tentar renderizar todos os destinatários no modal.
- Etiquetas duplicadas/sem clientes: contador deve ser deduplicado e permitir zero resultados sem quebrar criação de rascunho.
- Canal sem template MARKETING aprovado: editor deve mostrar estado vazio claro e impedir criação executável.
- Template com muitas variáveis ou carrossel incompleto: salvar deve falhar com mensagem amigável antes de qualquer chamada Meta inválida.
- Campanha concluída com status parcial/atrasado: relatório deve tolerar `accepted/sent/delivered/read/failed` sem exigir que todos tenham o mesmo estado.

---

### Task 1: Navegação e shell simplificado do Marketing

**Files:**
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `vitrine/admin/marketing/marketing-polish.css`
- Modify: `vitrine/admin/marketing/campaign-entry.js`
- Test: `scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: módulos atuais de Templates, Públicos e Campanhas.
- Produces: navegação canônica `overview/templates/campaigns/audiences` e helpers de shell sem Consentimentos no primeiro nível.

- [ ] **Step 1: Write failing shell contract**

Assertar:
- ordem das quatro abas;
- ausência de Consentimentos na navegação principal;
- um único status operacional;
- ausência de títulos duplicados;
- nenhum termo `snapshot|dispatch|outbox|WAMID` no shell comum.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`
Expected: FAIL na navegação/duplicação atual.

- [ ] **Step 3: Implement minimal shell**

Centralizar títulos/subtítulos, navegação, espaçamento e estado operacional em `marketing-polish.*`. Remover inserções duplicadas sem alterar handlers de backend.

- [ ] **Step 4: Run GREEN + regressions**

Run:
- `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`
- `node scripts/test-whatsapp-marketing-audience-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-ui-v1.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `ui: simplificar shell do Marketing`

---

### Task 2: Templates no fluxo lista → tipo → editor

**Files:**
- Modify: `vitrine/admin/marketing/template-center.js`
- Modify: `vitrine/admin/marketing/template-center.css`
- Create: `vitrine/admin/marketing/template-type-picker.js`
- Test: `scripts/test-whatsapp-marketing-template-simple-ui-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: `admin-whatsapp-templates-v1` e cache `whatsapp_templates_v1`.
- Produces: `openTemplateTypePicker()` e editor simples de Campanha/Atendimento; carrossel fica reservado à Task 5.

- [ ] **Step 1: Write failing template UI contract**

Assertar:
- cabeçalho `Modelos de mensagem`;
- `+ Novo` e `Sincronizar`;
- filtros busca/tipo/canal/status em uma linha;
- tabela com Nome/Tipo/Canal/Status/Qualidade/Atualizado/Ações;
- picker com Resposta rápida/Atendimento/Campanha/Carrossel;
- `Opções avançadas` recolhido por padrão.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-template-simple-ui-v1.mjs`
Expected: FAIL no picker/estrutura simples.

- [ ] **Step 3: Implement picker e editor simplificado**

Mover campos secundários do builder atual para `<details>` e preservar payload atual para tipos já suportados.

- [ ] **Step 4: Run GREEN + syntax**

Run:
- `node scripts/test-whatsapp-marketing-template-simple-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-template-admin-ui-v1.mjs`
- `node --check vitrine/admin/marketing/template-center.js`
- `node --check vitrine/admin/marketing/template-type-picker.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `ui: simplificar Templates de Marketing`

---

### Task 3: Campanha simples com Todos os clientes / Por etiquetas

**Files:**
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Modify: `vitrine/admin/marketing/campaign-center.css`
- Modify: `vitrine/admin/marketing/audience-center.js`
- Test: `scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`
- Modify: `.github/workflows/marketing-campaign-execution-ui-ci.yml`

**Interfaces:**
- Consumes: filtros `marketing_preview_audience_v1`, `label_ids`, criação/snapshot/agendamento atuais.
- Produces: `audience_mode: 'all'|'labels'` somente como estado de UI; backend recebe `filters={}` ou `filters={label_ids:[...]}`.

- [ ] **Step 1: Write failing simple-campaign contract**

Assertar:
- modal `Nova campanha` com Nome/Descrição/Canal/Template;
- `Iniciar agora` / `Agendar para`;
- público `Todos os clientes` / `Por etiquetas`;
- seleção múltipla de etiquetas;
- contador de selecionados via preview server-side;
- nenhum filtro avançado visível por padrão;
- nenhum campo de UUID manual.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`
Expected: FAIL no editor atual de filtros avançados.

- [ ] **Step 3: Implement UI e mapping de filtros**

`Todos os clientes` => `{}`. `Por etiquetas` => `{label_ids:[...]}`. Reutilizar API de labels já existente no Atendimento/Audience.

- [ ] **Step 4: Add review-focus tests**

Cobrir:
- zero etiquetas selecionadas;
- etiqueta sem clientes;
- múltiplas etiquetas com dedupe;
- canal sem template MARKETING aprovado.

- [ ] **Step 5: Run GREEN + regressions**

Run:
- `node scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-execution-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-audience-ui-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `ui: simplificar público das campanhas`

---

### Task 4: Lista de campanhas e execução no padrão simples

**Files:**
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Modify: `vitrine/admin/marketing/campaign-center.css`
- Test: `scripts/test-whatsapp-marketing-campaign-list-simple-v1.mjs`

**Interfaces:**
- Consumes: `admin-marketing-campaigns-v1?action=list/detail/execution_status`.
- Produces: tabela simples e ações contextuais amigáveis.

- [ ] **Step 1: Write failing list contract**

Assertar colunas Nome/Data/Destinatários/Canal/Status/Ações/Relatório e ausência de revisão/snapshot como ações primárias.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-campaign-list-simple-v1.mjs`
Expected: FAIL na lista atual baseada em cards técnicos.

- [ ] **Step 3: Implement tabela e ações contextuais**

Mapear estados internos para labels Rascunho/Agendada/Em execução/Pausada/Concluída/Cancelada/Falhou.

- [ ] **Step 4: Run GREEN**

Run: `node scripts/test-whatsapp-marketing-campaign-list-simple-v1.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `ui: simplificar lista de campanhas`

---

### Task 5: Templates de carrossel Meta

**Files:**
- Modify: `supabase/functions/admin-whatsapp-templates-v1/index.ts`
- Modify/Create migration only if cache schema cannot store current Meta components unchanged.
- Create: `vitrine/admin/marketing/template-carousel-editor.js`
- Modify: `vitrine/admin/marketing/template-center.js`
- Modify: `vitrine/admin/marketing/template-center.css`
- Test: `scripts/test-whatsapp-marketing-template-carousel-v1.mjs`
- Test: `scripts/test-admin-whatsapp-template-carousel-v1.mjs`

**Interfaces:**
- Consumes: transport/mutation de template Meta atual.
- Produces: payload canônico de template carrossel com 2–10 cards, sem Graph no browser.

- [ ] **Step 1: Audit current Meta mutation support**

Confirmar se `admin-whatsapp-templates-v1` já aceita componentes de carrossel sem transformação destrutiva. Se sim, não alterar schema.

- [ ] **Step 2: Write RED backend contract**

Assertar:
- categoria MARKETING;
- 2–10 cards;
- mídia image/video;
- body/button/url por card;
- rejeição de card incompleto;
- sem token/Graph no frontend.

- [ ] **Step 3: Run RED**

Run: `node scripts/test-admin-whatsapp-template-carousel-v1.mjs`
Expected: FAIL apenas no suporte faltante.

- [ ] **Step 4: Implement minimal server-side support**

Preservar transport Meta atual e validar allowlist de campos/componentes.

- [ ] **Step 5: Write RED UI contract and implement editor**

Editor com 2 cards iniciais, adicionar/remover/reordenar até 10, preview responsivo e opções de mídia.

- [ ] **Step 6: Run GREEN**

Run:
- `node scripts/test-admin-whatsapp-template-carousel-v1.mjs`
- `node scripts/test-whatsapp-marketing-template-carousel-v1.mjs`
- `node --check vitrine/admin/marketing/template-carousel-editor.js`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: criar templates carrossel no Marketing`

---

### Task 6: Relatório simples de campanha

**Files:**
- Modify: `supabase/functions/admin-marketing-campaigns-v1/index.ts`
- Create: `vitrine/admin/marketing/campaign-report.js`
- Modify: `vitrine/admin/marketing/campaign-center.js`
- Modify: `vitrine/admin/marketing/campaign-center.css`
- Test: `scripts/test-admin-marketing-campaign-report-v1.mjs`
- Test: `scripts/test-whatsapp-marketing-campaign-report-ui-v1.mjs`

**Interfaces:**
- Consumes: `marketing_campaign_dispatches_v1`, canonical message/status ledgers.
- Produces: `GET action=report&campaign_id=<uuid>` com agregados e itens sanitizados/mascarados.

- [ ] **Step 1: Write RED API contract**

Assertar contagens total/sent/delivered/read/failed, taxas e lista com telefone mascarado; sem WAMID por padrão.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-admin-marketing-campaign-report-v1.mjs`
Expected: FAIL porque `report` ainda não existe.

- [ ] **Step 3: Implement report endpoint read-only**

Reusar tabelas canônicas; tolerar status parcial e mensagens sem read.

- [ ] **Step 4: Write RED UI contract and implement modal**

Cards Enviados/Entregues/Lidos/Falhas + tabela Cliente/Telefone/Status/Atualização.

- [ ] **Step 5: Run GREEN**

Run:
- `node scripts/test-admin-marketing-campaign-report-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-report-ui-v1.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: adicionar relatório simples de campanhas`

---

### Task 7: Públicos avançados como área secundária

**Files:**
- Modify: `vitrine/admin/marketing/audience-center.js`
- Modify: `vitrine/admin/marketing/audience-center.css`
- Test: `scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`

**Interfaces:**
- Consumes: preview atual e handoff para Campanhas.
- Produces: quatro filtros básicos visíveis e `<details>` para avançados.

- [ ] **Step 1: Write RED progressive-disclosure contract**

Assertar Cliente/Cidade/Bairro/Etiquetas visíveis e demais filtros dentro de `Mais filtros` fechado.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`
Expected: FAIL porque hoje filtros avançados aparecem diretamente.

- [ ] **Step 3: Implement minimal disclosure**

Preservar `collectFilters()` e handoff de campanha sem alterar semântica.

- [ ] **Step 4: Run GREEN**

Run:
- `node scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`
- `node scripts/test-whatsapp-marketing-audience-ui-v1.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `ui: recolher filtros avançados de Públicos`

---

### Task 8: Visão geral, responsividade e regressão final

**Files:**
- Modify: `vitrine/admin/marketing/marketing-polish.js`
- Modify: `vitrine/admin/marketing/marketing-polish.css`
- Test: `scripts/test-whatsapp-marketing-papoai-responsive-v1.mjs`
- Modify: `.github/workflows/marketing-professional-ui-ci.yml`

**Interfaces:**
- Consumes: todos os módulos anteriores.
- Produces: visão geral compacta e layout final desktop/mobile.

- [ ] **Step 1: Write RED responsive/overview contract**

Assertar cards Campanhas/Templates/Clientes/Entregas, últimas campanhas, breakpoints e CTAs mobile.

- [ ] **Step 2: Run RED**

Run: `node scripts/test-whatsapp-marketing-papoai-responsive-v1.mjs`
Expected: FAIL nos requisitos ainda ausentes.

- [ ] **Step 3: Implement overview e acabamento responsivo**

Usar apenas tokens existentes do Admin; sem nova biblioteca CSS.

- [ ] **Step 4: Run complete Marketing/WhatsApp suite**

Run:
- `node scripts/test-whatsapp-marketing-papoai-shell-v1.mjs`
- `node scripts/test-whatsapp-marketing-template-simple-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-simple-audience-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-list-simple-v1.mjs`
- `node scripts/test-whatsapp-marketing-template-carousel-v1.mjs`
- `node scripts/test-admin-whatsapp-template-carousel-v1.mjs`
- `node scripts/test-admin-marketing-campaign-report-v1.mjs`
- `node scripts/test-whatsapp-marketing-campaign-report-ui-v1.mjs`
- `node scripts/test-whatsapp-marketing-audience-progressive-v1.mjs`
- existing WhatsApp Meta Central CI

Expected: PASS.

- [ ] **Step 5: Security/runtime verification**

Confirmar em produção após merge/deploy controlado:
- PapoAI inbound preservado;
- ANA OFF;
- campanhas não graduadas automaticamente;
- sem novo Graph client-side;
- zero segredo no frontend.

- [ ] **Step 6: Commit**

Commit: `ui: finalizar Marketing simples inspirado no PapoAI`
