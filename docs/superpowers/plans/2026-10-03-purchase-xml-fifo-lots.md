# Purchase XML FIFO Lots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar múltiplos EANs, entradas por XML com validade opcional e consumo FIFO sem substituir o estoque canônico do Bling.

**Architecture:** O vínculo de EAN continua em `product_identifiers`. Cada item de XML cria um lote interno pendente; a verificação do recebimento no Bling o ativa. Reservas da vitrine ganham uma tabela de alocação por lote e triggers FIFO. A UI usa as ações autenticadas da Edge Function `purchase-xml-v1`.

**Tech Stack:** PostgreSQL/Supabase, Supabase Edge Functions (Deno/TypeScript), Vitrine Admin HTML/JS, GitHub Actions/Python verifier.

**Spec:** `docs/superpowers/specs/2026-10-03-purchase-xml-fifo-lots.md`

## Global Constraints

- Bling permanece autoridade do estoque total.
- Validade de lote é opcional.
- Não exigir número real de lote.
- Novo EAN não apaga EAN antigo.
- FIFO pela entrada mais antiga.
- Divergência de lotes internos nunca pode bloquear venda que passou na autoridade Bling.

## Review Focus

- Migração inicial com reservas abertas: reservar, mas não consumir novamente histórico.
- XML repetido/reprocessado: não duplicar lote do mesmo item.
- Troca manual de `product_id` antes do recebimento: lote pendente acompanha o novo produto.
- Validade vazia: não bloquear preflight/recebimento.
- Defasagem lotes x Bling: criar reconciliação técnica e concluir reserva.

---

### Task 1: Contrato de banco e testes estáticos

**Files:**
- Create: `scripts/verify_purchase_xml_fifo_lots_v1.py`
- Create: `supabase/migrations/20261004033000_purchase_xml_fifo_lots_v1.sql`

**Interfaces:**
- Produces: colunas de validade/lote, `vitrine_stock_reservation_lots`, funções/triggers de sincronização e FIFO.

- [ ] Escrever verifier RED exigindo schema, funções, triggers, índices, RLS e regras de validade opcional/FIFO.
- [ ] Executar verifier antes da migration e confirmar falha.
- [ ] Implementar migration mínima para tornar o verifier GREEN.
- [ ] Executar verifier e confirmar sucesso.

### Task 2: Ações autenticadas da Edge Function

**Files:**
- Modify: `supabase/functions/purchase-xml-v1/index.ts`
- Modify: `supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts`
- Test: `scripts/verify_purchase_xml_fifo_lots_v1.py`

**Interfaces:**
- Produces: `lot_state` e `set_lot_expiration` via `purchaseApi`.
- Consumes: `purchase_xml_items.lot_expiration_date` e `inventory_lot_id` da Task 1.

- [ ] Acrescentar expectativas RED no verifier para as duas ações.
- [ ] Confirmar falha.
- [ ] Implementar leitura e gravação de validade/estado do lote, rejeitando gravação por chamadas internas e usando admin autenticado.
- [ ] Confirmar GREEN.

### Task 3: UI de validade no XML

**Files:**
- Modify: `vitrine/admin/index.html`
- Test: `scripts/verify_purchase_xml_fifo_lots_v1.py`

**Interfaces:**
- Consumes: ações `lot_state` e `set_lot_expiration` da Task 2.

- [ ] Acrescentar expectativas RED do painel de validade/lote no verifier.
- [ ] Confirmar falha.
- [ ] Injetar campo de validade opcional, botões salvar/limpar e indicador do estado do lote junto do painel de identificação existente.
- [ ] Confirmar GREEN e preservar busca manual de produto existente.

### Task 4: Aplicação no Supabase e verificação funcional

**Files:**
- Apply: migration da Task 1 no projeto `ssbesxgaijknwsjbsbcz`.
- Deploy: Edge Function `purchase-xml-v1` somente se o código final divergir da versão implantada.

**Interfaces:**
- Consumes todas as Tasks anteriores.

- [ ] Aplicar migration.
- [ ] Confirmar lote-base para estoque avulso atual e lotes pendentes para XMLs existentes.
- [ ] Confirmar que reservas abertas estão alocadas e histórico consumido não foi debitado de novo.
- [ ] Testar em transação o FIFO com duas entradas e rollback.
- [ ] Conferir advisors pós-migração e ausência de novos avisos críticos introduzidos pela mudança.

### Task 5: PR, CI e integração

**Files:** todos acima.

- [ ] Abrir PR pequeno da branch `feat/purchase-xml-fifo-lots-v1`.
- [ ] Inspecionar diff completo e CI.
- [ ] Corrigir qualquer falha importante com RED→GREEN.
- [ ] Fazer merge somente após a validação final.
