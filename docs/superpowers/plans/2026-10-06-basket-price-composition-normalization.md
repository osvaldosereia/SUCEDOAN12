# Basket Price & Composition Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fazer toda cesta obedecer à fórmula `produtos da composição + ajuste fixo do molde`, eliminar erros objetivos de composição e tornar a formação do preço visível no Admin.

**Architecture:** preservar lotes e quantidades físicas; normalizar apenas dados de composição e a camada comercial de preço. Durante `legacy_first`, o lote físico continua sendo a fonte de estoque, mas seu preço passa a ser calculado pela mesma regra do molde. O Admin passa a exibir preços dos produtos e uma prévia `Produtos + Ajuste = Total` para as composições persistidas.

**Tech Stack:** PostgreSQL/Supabase, Edge Functions existentes, JavaScript do Admin, Node.js contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-06-cestas-molde.md`

## Global Constraints

- não alterar `quantity_available`, `quantity_built`, status ou reservas de lotes;
- preservar os ajustes fixos configurados pelo operador (`8`, `10`, `20`, etc.);
- preço comercial corrente = soma dos produtos efetivos + ajuste fixo do molde;
- `Só Alimento` não pode conter Papel Higiênico;
- não aceitar Caldo como variação de Lámen nem biscoito pequeno como variação de Rosquinha 500 g nos dados atuais;
- checkout e vitrine devem usar a mesma fonte de preço.

## Review Focus

- lotes `legacy_full` devem usar o ajuste do molde sem perder a alocação física;
- lote `food` sem higiene deve usar o molde `Só Alimento` da mesma família quando houver;
- cesta sem molde deve manter a regra comercial antiga;
- limpeza de opções nunca pode deixar uma posição sem opção válida;
- Admin deve deixar explícito qual parcela vem dos produtos e qual é o ajuste fixo.

---

### Task 1: Contratos RED
- [ ] criar teste de contrato de preço/composição;
- [ ] criar workflow dedicado;
- [ ] confirmar falha antes da implementação.

### Task 2: Preço único de transição
- [ ] criar helper de preço para lotes vinculados a moldes;
- [ ] usar helper no catálogo público e em `basket_lot_commercial_price_v1`;
- [ ] manter fallback antigo para cestas fora do novo domínio.

### Task 3: Higienização de composição
- [ ] remover posições de Papel Higiênico dos moldes `food_only`;
- [ ] remover Caldo das posições de Lámen;
- [ ] restaurar Rosquinha Rancheiro 500 g onde necessário e remover opções não-Rosquinha das posições de Rosquinha.

### Task 4: Transparência no Admin
- [ ] incluir preço efetivo e prévia de composições no RPC de editor;
- [ ] mostrar preço nas opções de produto;
- [ ] mostrar `Produtos + Ajuste = Total` por Tipo;
- [ ] deixar claro que o ajuste é fixo e não é o preço final da cesta.

### Task 5: Homologação
- [ ] aplicar migration no Supabase canônico;
- [ ] recalcular os 9 moldes e conferir preços;
- [ ] confirmar lotes/quantidades físicas inalterados;
- [ ] regressão de storefront/checkout/Admin;
- [ ] merge somente com CI verde.
