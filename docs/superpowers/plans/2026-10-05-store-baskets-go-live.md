# Store Baskets Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** concluir Cestas do Site com reserva física, montagem, lote, impressão A4, disponibilidade pública e baixa correta na venda.

**Architecture:** preservar #857/#858 como domínio canônico; Edge Function administrativa é a única fronteira de mutação; storefront/checkout consomem apenas estoque de lote montado. Legado só será isolado após regressão.

**Tech Stack:** Supabase PostgreSQL/RPC, Supabase Edge Functions, JavaScript Admin, Playwright/Node contract tests.

## Global Constraints
- Não duplicar baixa de componentes após montagem.
- Reserva em montagem não é vendável.
- Cancelamento libera reserva antes da montagem.
- Lote montado vira estoque próprio da cesta.
- RPCs físicos permanecem service_role only.
- Somente teste humano bloqueia a conclusão automática.

## Review Focus
- dupla reserva/dupla baixa;
- lote montado consumido no FIFO correto;
- cancelamento após estado inválido;
- divergência entre site e estoque real;
- legado interferindo no checkout.

### Task 1: Estoque físico e UI operacional
- [x] reserve/mount/cancel/builds na Edge Function
- [x] botões e histórico na Cestas do Site
- [x] busy guard e confirmação operacional
- [x] testes de segurança do domínio

### Task 2: Lotes e impressão A4
- [x] contrato do detalhe do lote
- [x] RPC de detalhe para impressão
- [ ] rota build_detail na Edge Function
- [ ] botão Imprimir no histórico
- [ ] layout A4 com 4 colunas e foto/nome/quantidade

### Task 3: Site e checkout
- [ ] provar disponibilidade pública só de lotes ready/mounted/sale_enabled
- [ ] provar que venda reduz o lote e não os componentes novamente
- [ ] validar comportamento com alteração parcial de composição

### Task 4: Regressão e legado
- [ ] regressão admin + storefront + checkout + pedidos + estoque
- [ ] isolar editor antigo sem apagar histórico
- [ ] remover rotas/botões duplicados somente após regressão verde

### Task 5: Go-live humano
- [ ] operador reserva 10 cestas reais
- [ ] confere separação física
- [ ] marca montado
- [ ] visualiza no site
- [ ] realiza pedido controlado e confere saldo 10→9
