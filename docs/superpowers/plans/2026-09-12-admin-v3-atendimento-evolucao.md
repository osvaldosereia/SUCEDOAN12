# Admin V3 Atendimento e Evolução Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o `admin-v3` no centro único de gestão do atendimento, com histórico real de 7 dias, análise da estratégia e histórico auditável de ajustes.

**Architecture:** Reutilizar o motor `service_simple_rules` + `conversation-worker-v3`. Adicionar tabelas de snapshot/análise e change log, uma Edge Function administrativa dedicada e uma página/área do `admin-v3` que integra editor, histórico e evolução. O motor automático permanece desligado até homologação controlada.

**Tech Stack:** HTML/CSS/JavaScript do Admin V3, Supabase Postgres, Edge Functions Deno/TypeScript, funções RPC existentes, GitHub.

**Spec:** `docs/superpowers/specs/2026-09-12-admin-v3-atendimento-evolucao-design.md`

## Global Constraints

- Usar somente `admin-v3` como painel novo.
- Não reativar sistemas legados de Agent Core/service intelligence antiga.
- Não duplicar mensagens para formar o histórico de 7 dias.
- Novas tabelas administrativas com RLS ativa e sem acesso direto de `anon`/`authenticated`.
- Motor automático deve permanecer desligado até os testes finais controlados.
- Mudanças de estratégia nunca são aplicadas automaticamente por análise.

---

### Task 1: Banco de auditoria e snapshots

**Files:**
- Create: `supabase/migrations/20260912_admin_v3_service_strategy_evolution_v1.sql`
- Test: consultas SQL de smoke test via Supabase MCP.

**Interfaces:**
- Produces: `service_strategy_analysis_snapshots`, `service_strategy_change_log`, triggers de auditoria e RPCs administrativas seguras.

- [ ] Criar migration com tabelas, RLS, grants e índices.
- [ ] Criar trigger que registre INSERT/UPDATE/DELETE em `service_simple_rules` e UPDATE em `service_simple_runtime_config`.
- [ ] Criar RPC `get_service_strategy_7d_metrics_v1()` com métricas agregadas de 7 dias.
- [ ] Aplicar migration no projeto Supabase.
- [ ] Rodar smoke tests e confirmar que as tabelas/RPCs existem e retornam dados sem alterar runtime.

### Task 2: API administrativa de atendimento

**Files:**
- Create: `supabase/functions/admin-service-strategy-v1/index.ts`

**Interfaces:**
- Consumes: sessão do Admin, tabelas `conversations`, `messages`, `service_simple_rules`, `service_strategy_*`.
- Produces actions: `dashboard`, `conversations_7d`, `conversation_detail`, `generate_snapshot`, `snapshots`, `change_log`, `annotate_change`.

- [ ] Implementar autenticação usando `auth.getUser` + `admin_users`.
- [ ] Implementar leitura paginada das conversas de 7 dias e detalhe das mensagens.
- [ ] Implementar dashboard com métricas de cobertura/fallback/handoff/uso de recursos.
- [ ] Implementar geração determinística de snapshot e recomendações priorizadas, sem alteração automática de regras.
- [ ] Implementar leitura do histórico de ajustes e anotação de motivo/resultado esperado.
- [ ] Deploy da Edge Function com `verify_jwt=true`.
- [ ] Testar health/auth e consultas administrativas.

### Task 3: Central de Atendimento no Admin V3

**Files:**
- Modify: `admin-v3/index.html`
- Create: `admin-v3/atendimento.html`
- Create: `admin-v3/service-strategy.js`
- Create or modify: `admin-v3/service-strategy.css`
- Reuse: `admin-v3/service-intelligence.js`, `admin-v3/service-intelligence.css` quando apropriado.

**Interfaces:**
- Consumes: `admin-service-intelligence-simple-v1` e `admin-service-strategy-v1`.
- Produces: UI única com Regras, Histórico 7 dias e Evolução.

- [ ] Adicionar entrada “Atendimento” ao menu do Admin V3.
- [ ] Criar página com abas Regras, Histórico 7 dias e Evolução.
- [ ] Integrar editor de regras na área do Admin V3 sem depender de `admin/inteligencia.html`.
- [ ] Implementar lista e detalhe das conversas dos últimos 7 dias.
- [ ] Implementar cards de métricas, botão de gerar análise e tabela de histórico de ajustes.
- [ ] Garantir layout mobile-first e ausência de exposição de tokens/secrets.

### Task 4: Testes e homologação segura

**Files:**
- Create: `tests/admin-v3-service-strategy-contract.mjs`
- Create or modify tests existentes do atendimento se houver.

**Interfaces:**
- Verifica: presença dos recursos, chamadas esperadas e proteção contra reativação acidental.

- [ ] Criar testes de contrato para os arquivos do Admin V3 e Edge Function.
- [ ] Confirmar que `ai_enabled`, `conversation_worker_enabled`, `conversation_worker_dispatch_enabled` e `whatsapp_auto_reply_enabled` continuam `false`.
- [ ] Gerar primeiro snapshot de análise de 7 dias.
- [ ] Registrar baseline atual no histórico de estratégia.
- [ ] Rodar todos os testes relacionados e registrar resultado.

### Task 5: Preparar teste controlado

**Files:**
- Modify only if necessary after verification.

**Interfaces:**
- Produces: checklist de teste e configuração pronta para ativação explícita posterior.

- [ ] Validar as quatro regras publicadas atuais e seus modos.
- [ ] Identificar lacunas mais frequentes a partir das conversas reais de 7 dias.
- [ ] Propor/registrar ajustes iniciais sem ativar automaticamente o worker.
- [ ] Confirmar Admin V3 e banco prontos para teste controlado.
