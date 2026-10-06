# Cestas Molde R6 — Cutover Seguro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** concluir o novo modelo Cesta Molde sem perder as 256 cestas físicas prontas nem duplicar estoque.

**Architecture:** preservar lotes físicos legados como primeira fonte de venda enquanto houver disponibilidade. Criar 9 moldes canônicos (Econômica; Mini/Pequena/Média/Grande em Só Alimento e Completa), com transição automática para composições de molde apenas quando as fontes legadas do respectivo molde zerarem. Nenhuma desmontagem física ou baixa de lote será executada por esta migration.

**Tech Stack:** PostgreSQL/Supabase, Edge Function `storefront-v2`, Node.js contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-cestas-molde.md`

## Global Constraints

- preservar pedidos, reservas, lotes e estoque físico existentes;
- nenhuma visualização pública reserva estoque;
- `public_composition_count` continua limitado a 1–4;
- valor oculto inicial é recalculado no cutover para preservar o preço comercial atual da composição canônica;
- kits internos permanecem apenas como compatibilidade técnica;
- lotes legados vencem naturalmente: não desmontar automaticamente.

## Review Focus

- lote físico legado ainda disponível deve impedir a exibição da composição gerada do mesmo molde;
- quando todas as fontes legadas zerarem, o molde deve aparecer automaticamente;
- 9 moldes operacionais no Admin; fontes Koblenz e Kit Limpeza não podem poluir a lista diária;
- nenhuma migration R6 pode chamar `release_legacy_basket_lot_units_v1` ou reduzir `basket_stock_lots`;
- preço inicial de cada molde deve preservar a cesta canônica pela fórmula produtos atuais + valor oculto recalculado.

---

### Task 1: Contrato RED do cutover
- [ ] criar `scripts/test-basket-mold-cutover-r6.mjs`;
- [ ] adicionar workflow específico;
- [ ] provar falha antes da implementação.

### Task 2: Migração de dados R6
- [ ] renomear identidades canônicas Bonini para Completa;
- [ ] criar quatro templates Só Alimento;
- [ ] criar/configurar 9 moldes com duas composições iniciais;
- [ ] adicionar Bonini/Koblenz como opções de Arroz 5 kg;
- [ ] recalcular valor oculto dos moldes completos no instante da migração;
- [ ] copiar esse valor comercial para o respectivo molde Só Alimento;
- [ ] marcar fontes legadas em `rules`/`metadata`, sem desativar lotes.

### Task 3: Cutover automático no storefront
- [ ] `moldHomeCards()` deve ler `metadata.legacy_source_basket_ids`;
- [ ] se qualquer fonte ainda tiver `public_available > 0`, não gerar cards do molde;
- [ ] quando zerar, gerar normalmente 1–4 composições do molde;
- [ ] manter checkout físico antigo para cards legados e `basket_mold` para cards novos.

### Task 4: Admin diário
- [ ] `admin_basket_mold_list_v1()` deve mostrar apenas os 9 moldes operacionais/canônicos;
- [ ] esconder fontes legadas e Kit Limpeza técnico do fluxo diário.

### Task 5: Homologação
- [ ] aplicar migration no Supabase canônico;
- [ ] validar exatamente 9 moldes;
- [ ] confirmar 256 unidades legadas intactas;
- [ ] smoke com rollback do checkout `basket_mold`;
- [ ] CI completa e merge somente verde.
