# Atendimento Admin Nativo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir definitivamente o Atendimento em iframe por uma rota nativa do Vitrine/Admin, com uma única implementação visual, fila unificada 0975/1018 e preservação integral dos fluxos Meta/Supabase já homologados.

**Architecture:** `/vitrine/admin/atendimento/` passa a ser uma página administrativa de primeira classe, sem iframe e sem `parent.document`/`postMessage`. A tela usa uma única árvore DOM e uma única folha de estilo; o core de leitura/fila/conversa/contexto fica em `attendance-app.js`, enquanto envio, mídia, templates, Humano×ANA e preview ANA continuam em módulos especializados já homologados. O item Atendimento do Admin navega para essa rota em vez de embuti-la.

**Tech Stack:** HTML/CSS/JavaScript ES modules, Supabase Edge Functions/RPCs existentes, Meta Cloud API existente, Node.js contract tests.

**Spec:** Solicitação do usuário em 2026-10-03: solução profissional e definitiva, sem iframe, sem camadas de layout sobrepostas e sem bridge entre UI antiga/nova.

## Global Constraints

- Projeto Supabase canônico: `ssbesxgaijknwsjbsbcz`.
- Não alterar checkout, pedidos, estoque, Bling, allowlists Meta ou gates da ANA.
- Não alterar contratos server-side homologados de texto, mídia, templates, Humano×ANA ou preview ANA.
- Não usar iframe no Atendimento.
- Não usar `parent.document`, `parent.postMessage` nem bridge de troca artificial entre canais.
- Uma única folha de estilo do Atendimento e uma única árvore DOM final.
- Fila padrão `Todas`, com filtros 0975 e 1018 e filtros rápidos Não lidas/Pedidos/Cadastro pendente.
- A conversa deve continuar funcional mesmo sem cliente vinculado.
- A tela precisa falhar visivelmente em caso de autenticação/API, nunca ficar indefinidamente em “Carregando”.

## Review Focus

- Falha de sessão/admin token: exibir erro acionável e permitir retry, sem loop infinito.
- Um canal indisponível: o outro continua utilizável e a fila unificada degrada parcialmente.
- Conversa sem customer_id: histórico e composer continuam abrindo.
- Troca Todas ↔ 0975 ↔ 1018: seleção nunca cruza account_id.
- Reentrada na página/refresh: listeners e timers não duplicam.

---

### Task 1: Contrato arquitetural sem iframe

**Files:**
- Create: `scripts/test-admin-attendance-native-v1.mjs`
- Modify: `vitrine/admin/index.html`
- Modify: `vitrine/admin/atendimento/index.html`

- [ ] Escrever teste RED exigindo ausência de iframe/bridge e navegação do Admin para `/vitrine/admin/atendimento/`.
- [ ] Implementar navegação nativa e remover contrato de `postMessage` do Admin.
- [ ] GREEN no teste e sintaxe inline do Admin.

### Task 2: Tela final única e fila unificada no core

**Files:**
- Create: `vitrine/admin/atendimento/attendance-app.js`
- Replace: `vitrine/admin/atendimento/attendance.css`
- Modify: `vitrine/admin/atendimento/index.html`
- Create: `scripts/test-admin-attendance-native-ui-v1.mjs`

- [ ] Teste RED para DOM final, `Todas|0975|1018`, filtros rápidos, painel integrado e ausência dos assets v3.
- [ ] Implementar core com accounts, fila unificada, conversa, contexto, polling e estados de erro.
- [ ] Preservar IDs públicos usados pelos módulos homologados de envio/mídia/templates/ANA.
- [ ] GREEN em contratos e `node --check`.

### Task 3: Remoção do legado visual

**Files:**
- Delete: `vitrine/admin/atendimento/attendance-layout-v3.js`
- Delete: `vitrine/admin/atendimento/attendance-layout-v3-bridge.js`
- Delete: `vitrine/admin/atendimento/attendance-layout-v3.css`
- Delete: `vitrine/admin/atendimento/attendance-layout-v3-polish.css`
- Stop loading: `vitrine/admin/atendimento/attendance.js`

- [ ] Teste RED exigindo que nenhum asset legado esteja referenciado.
- [ ] Remover assets e referências.
- [ ] Rodar todos os contratos existentes de envio, mídia, templates, Humano×ANA e ANA preview.

### Task 4: Deep links administrativos e validação final

**Files:**
- Modify: `vitrine/admin/index.html`
- Modify: `vitrine/admin/atendimento/attendance-app.js`
- Modify/Create tests under `scripts/`.

- [ ] Adicionar navegação segura de pedido/cliente/orçamento por URL para voltar ao Admin sem `postMessage`.
- [ ] Validar que IDs UUID são tratados no Admin antes de abrir recursos.
- [ ] Rodar CI completo relevante e revisar diff final.
