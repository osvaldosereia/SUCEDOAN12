# Central de Atendimento v2 — Fase 2 Organização Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar organização operacional da Central: etiquetas internas por conversa, respostas rápidas editáveis e barra de ações sem rolagem horizontal escondida.

**Architecture:** Manter `admin-whatsapp-ops-v1` como único gateway autenticado. Etiquetas e respostas rápidas vivem exclusivamente no Supabase e não sincronizam com tags do PapoAI. A fila v3 continua cronológica pela última mensagem canônica e apenas acrescenta filtro/metadata de etiquetas.

**Tech Stack:** Supabase Postgres/RPC, Edge Functions Deno/TypeScript, HTML/CSS/JavaScript do Vitrine Admin, testes contratuais Node.js.

**Spec:** `docs/superpowers/specs/2026-10-02-vitrine-atendimento-central-v2-design.md`

## Global Constraints

- Etiquetas são exclusivas do Vitrine Admin; não usar tags do PapoAI.
- “Excluir” etiqueta/resposta rápida significa desativar, preservando histórico e vínculos.
- Não alterar checkout, templates PapoAI, ANA0975/ANA1018 ou as 25 automações de cada agente.
- Não liberar `send_text`, `takeover` ou `release`.
- A fila permanece estritamente cronológica pela última mensagem canônica.
- 0975 e 1018 permanecem isolados por `whatsapp_account_id`.
- A interface não pode depender de scroll horizontal escondido para ações essenciais.

## Review Focus

1. Etiqueta desativada já vinculada continua auditável, mas não aparece como opção nova de filtro/atribuição.
2. Filtro por etiqueta não pode misturar 0975 e 1018 nem alterar ordem cronológica.
3. Renomear/mudar cor de etiqueta deve refletir em todos os vínculos sem recriá-los.
4. Resposta rápida desativada some dos atalhos sem apagar conteúdo histórico/configuração.
5. Desktop/tablet/mobile devem manter Catálogo/Respostas/Produtos/Mais acessíveis sem overflow horizontal oculto.

---

### Task 1: Persistência e contratos de etiquetas/respostas rápidas

**Files:**
- Create: `supabase/sql/20261002_admin_attendance_organization_v1.sql`
- Create: `scripts/test-admin-attendance-organization-sql-v1.mjs`

**Interfaces:**
- Produces tables `attendance_labels_v1`, `attendance_conversation_labels_v1`, `attendance_quick_replies_v1`.
- Produces RPC `ops2_admin_attendance_queue_v3(p_whatsapp_account_id uuid,p_limit int,p_search text,p_label_id uuid)`.

- [ ] Write RED test requiring tables, FKs, inactive semantics, service-role-only privileges, queue v3 account scope, label filter and `ORDER BY canonical_last_message_at DESC`.
- [ ] Run RED.
- [ ] Implement migration. Seed the six current hardcoded quick replies idempotently with stable titles/content, favorites true and sort order.
- [ ] Run GREEN.
- [ ] Commit.

### Task 2: Gateway CRUD seguro

**Files:**
- Modify: `supabase/functions/admin-whatsapp-ops-v1/index.ts`
- Create: `scripts/test-admin-attendance-organization-api-v1.mjs`

**Interfaces:**
- GET: `labels`, `conversation_labels`, `quick_replies`, queue gains optional `label_id`.
- POST: `label_save`, `label_deactivate`, `conversation_labels_set`, `quick_reply_save`, `quick_reply_deactivate`.
- Admin auth remains mandatory; all writes validated server-side.

- [ ] Write RED contract test for action allowlists, validation and absence of PapoAI/tag calls.
- [ ] Run RED.
- [ ] Implement minimal handlers; `conversation_labels_set` replaces only internal label links for one conversation in one transaction/RPC or safe delete+insert after validating conversation and label IDs.
- [ ] Run GREEN plus existing API regression.
- [ ] Commit.

### Task 3: Etiquetas na fila e editor interno

**Files:**
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.js`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Create: `scripts/test-admin-attendance-labels-ui-v1.mjs`

**Interfaces:**
- Queue has compact label filter control and manager button.
- Queue cards render assigned active labels.
- Conversation header/context permits assigning multiple labels.
- Manager modal/panel supports create, rename, color, order, deactivate.

- [ ] Write RED UI contract.
- [ ] Run RED.
- [ ] Implement label state/loading/filtering/assignment/manager with no horizontal overflow.
- [ ] Run GREEN + existing UI/realtime/syntax tests.
- [ ] Commit.

### Task 4: Respostas rápidas editáveis e toolbar compacta

**Files:**
- Modify: `vitrine/admin/atendimento/index.html`
- Modify: `vitrine/admin/atendimento/attendance.js`
- Modify: `vitrine/admin/atendimento/attendance.css`
- Create: `scripts/test-admin-attendance-quick-replies-v2.mjs`

**Interfaces:**
- Remove constant `QUICK_REPLIES` from JS.
- Favorite quick replies appear in `Respostas`; `Gerenciar` opens editor create/edit/deactivate/favorite/order.
- Main toolbar becomes `Catálogo | Respostas | Produtos | Mais ⋯`; `Mais` contains orçamento, nova venda, retorno, opt-out.
- `Produtos` opens context tab Products.

- [ ] Write RED test requiring DB-backed replies, no hardcoded constant, compact toolbar and More menu.
- [ ] Run RED.
- [ ] Implement minimal UI/editor and actions, preserving copy/open-PapoAI fallback.
- [ ] Run GREEN + full Attendance regressions and JS syntax.
- [ ] Commit.

### Task 5: Deploy e smoke test

**Files:** Verify only unless a regression needs a targeted fix.

- [ ] Run all `scripts/test-admin-attendance-*.mjs`, organization tests and syntax.
- [ ] Confirm `send_text/takeover/release` remain blocked and no PapoAI/checkout file is changed.
- [ ] Apply migration.
- [ ] Deploy `admin-whatsapp-ops-v1` only.
- [ ] Smoke test SQL/API: create temporary internal label, assign/read/filter, deactivate; create temporary quick reply, read/deactivate. Remove test visibility by deactivation, not destructive delete.
- [ ] Merge branch only after sync with latest main and successful Pages deploy.
