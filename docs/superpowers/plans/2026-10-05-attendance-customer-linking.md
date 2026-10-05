# Atendimento Customer Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconhecer, vincular, criar e editar clientes diretamente na lateral direita do Atendimento sem tocar no transporte Meta.

**Architecture:** Manter a Central de Atendimento existente intacta e adicionar um backend administrativo separado para identidade de cliente. O frontend entra como módulo lateral isolado, reutilizando o card Cliente já renderizado e recarregando a conversa depois de qualquer vínculo ou edição.

**Tech Stack:** Supabase/Postgres, Supabase Edge Functions (Deno/TypeScript), JavaScript ES modules, CSS, Node 22 contract tests.

**Spec:** `docs/superpowers/specs/2026-10-05-attendance-customer-linking-design.md`

## Global Constraints

- Não alterar Meta, WABA, webhooks, templates, envio, mídia ou ANA.
- Nunca escolher automaticamente entre identidades ambíguas.
- Nunca aceitar telefone do navegador como fonte do vínculo/criação; usar o telefone da conversa no servidor.
- Reutilizar `ops2_admin_customer_save_v2` para persistência de cliente.
- Novas RPCs somente `service_role`.
- Toda Edge action exige admin autenticado.

## Review Focus

- Telefone com e sem nono dígito deve continuar usando o resolvedor canônico.
- Duas identidades candidatas devem resultar em `ambiguous`, sem vínculo automático.
- Criação deve ignorar qualquer telefone enviado pelo frontend e usar `conversations.wa_contact_e164`.
- Vínculo manual com cliente existente não deve sobrescrever o telefone principal desse cliente.
- Reabrir/recarregar conversa após vínculo deve atualizar o contexto sem loop de reconciliação.

---

### Task 1: Contract tests e CI

**Files:**
- Create: `scripts/test-admin-attendance-customer-link-v1.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`

**Interfaces:**
- Consumes: spec aprovada.
- Produces: contrato RED/GREEN para SQL, Edge e frontend.

- [ ] Escrever teste que exige RPCs de reconciliar/buscar/vincular, Edge Function dedicada, módulo de UI e regras de segurança.
- [ ] Adicionar o teste ao workflow do Atendimento.
- [ ] Abrir PR e verificar RED porque os artefatos de produção ainda não existem.

### Task 2: Identidade e vínculo no banco

**Files:**
- Create: `supabase/migrations/20261005104500_attendance_customer_link_v1.sql`
- Create: `supabase/sql/20261005_attendance_customer_link_v1.sql`

**Interfaces:**
- Consumes: `resolve_customer_by_phone_v1`, `ops2_admin_customer_save_v2`, `conversations`, `customers`, `customer_phones`, `whatsapp_messages_v1`.
- Produces: `ops2_admin_attendance_reconcile_customer_v1(uuid)`, `ops2_admin_attendance_customer_search_v1(text,integer)`, `ops2_admin_attendance_link_customer_v1(uuid,uuid)`.

- [ ] Implementar reconciliação segura e idempotente.
- [ ] Implementar busca administrativa limitada e documento mascarado.
- [ ] Implementar vínculo manual sem alterar telefone do cliente.
- [ ] Atualizar mensagens da conversa que ainda estiverem sem `customer_id`.
- [ ] Revogar execução pública/autenticada e conceder apenas a `service_role`.
- [ ] Verificar teste GREEN para SQL.

### Task 3: Backend administrativo isolado

**Files:**
- Create: `supabase/functions/admin-attendance-customer-v1/index.ts`

**Interfaces:**
- Consumes: RPCs da Task 2 e `ops2_admin_customer_save_v2`.
- Produces actions: `status`, `search`, `editor`, `reconcile`, `link`, `create`, `save`.

- [ ] Implementar autenticação admin igual ao padrão do Atendimento.
- [ ] `status/editor/search` somente leitura.
- [ ] `reconcile/link/create/save` somente POST.
- [ ] Em `create`, obter telefone da conversa no servidor e sobrescrever/ignorar telefone do payload.
- [ ] Em `save`, fixar `id` no cliente atualmente vinculado à conversa.
- [ ] Verificar contrato e respostas de erro determinísticas.

### Task 4: UI lateral direita

**Files:**
- Create: `vitrine/admin/atendimento/attendance-customer.js`
- Create: `vitrine/admin/atendimento/attendance-customer.css`
- Modify: `vitrine/admin/atendimento/attendance-offers.js`

**Interfaces:**
- Consumes: Edge actions da Task 3 e DOM existente (`#contextBody`, `.queue-card.selected`, tab `customer`).
- Produces: reconciliação automática, formulário inline, busca/vínculo e edição.

- [ ] Carregar módulo de cliente como side-effect import no módulo Ofertas já carregado pela página.
- [ ] Observar renderização do card Cliente sem interferir em outras abas.
- [ ] Se não vinculado, executar uma reconciliação por conversa; se vinculou, reclicar a conversa para o app recarregar o contexto.
- [ ] Renderizar botões `Cadastrar cliente` e `Buscar cadastro` quando não houver match.
- [ ] Renderizar estado ambíguo sem auto-vínculo.
- [ ] Implementar formulário de criação com WhatsApp somente leitura.
- [ ] Implementar busca e vínculo manual.
- [ ] Adicionar `Editar aqui` para cliente vinculado e salvar inline.
- [ ] Após qualquer escrita, recarregar a conversa para sincronizar contexto e ferramentas.

### Task 5: Verificação e PR

**Files:**
- Verify: arquivos das Tasks 1–4.

**Interfaces:**
- Consumes: branch completa.
- Produces: PR pequeno, CI verde e pacote pronto para revisão/merge.

- [ ] Rodar/observar o novo teste GREEN.
- [ ] Observar o workflow completo `attendance-papoai-send-ci` verde.
- [ ] Conferir diff contra `main` para garantir ausência de mudanças no transporte Meta.
- [ ] Revisar permissões SQL e validação de UUID/admin.
- [ ] Não mergear nem publicar Edge/migration sem aprovação explícita de produção.
