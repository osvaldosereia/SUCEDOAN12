# Central de Atendimento v2 — Fase 3 Comercial Implementation Plan

**Goal:** Permitir selecionar vários produtos no atendimento, definir quantidades, preparar conteúdo para o cliente, entregar os itens ao editor de orçamento/nova venda existente e administrar o cache local dos templates aprovados sem fingir sincronização automática com PapoAI.

**Spec:** `docs/superpowers/specs/2026-10-02-vitrine-atendimento-central-v2-design.md`

## Constraints
- Não alterar PapoAI, checkout, ANA ou webhooks.
- Não liberar envio humano direto.
- Não alterar pedido confirmado silenciosamente.
- Produtos usam preço/estoque do Supabase.
- Handoff comercial reaproveita Orçamentos/Nova venda existentes.
- Templates são cache interno; sincronização automática continua não homologada.

### Task 1 — Cache/admin de templates
- Criar migration aditiva para metadata de Atendimento e seed dos dois templates atualmente comprovados como ATIVOS.
- Gateway: GET `templates`; POST `template_save`, `template_deactivate`, `template_attendance_toggle`.
- Testes RED/GREEN, sem chamada PapoAI.

### Task 2 — Seleção múltipla de produtos
- Estado `selectedProducts` por product_id com quantidade.
- Cards mostram foto, nome, preço, estoque, checkbox e quantidade.
- Rodapé: selecionados, preparar para cliente, adicionar ao orçamento, nova venda.
- Quantidade nunca excede estoque vendável.
- Preparar para cliente gera texto limpo no rascunho; envio continua copiar + PapoAI.

### Task 3 — Handoff para orçamento/venda
- `emitParent(open_quote/new_sale)` passa somente customer snapshot seguro + itens `{id,name,quantity,unitPrice,price_cents}`.
- Parent valida payload.
- Orçamento recebe draft completo em `localStorage` no formato já consumido por `orcamento/app-original.html`.
- Nova venda recebe cliente e itens diretamente no carrinho do modal existente.
- Testes garantem que pedido confirmado não é alterado.

### Task 4 — Gerenciador/atalhos de templates
- Aba/diálogo Templates mostra cache local por canal, status, categoria e `Mostrar no atendimento`.
- Atalhos selecionados aparecem perto da conversa, mas apenas preparam o nome/contexto e abrem PapoAI; não simulam envio.
- Gerenciador permite editar cache/manual metadata, ativar/desativar e escolher visibilidade.

### Task 5 — Verificação/deploy
- Rodar regressão completa da Central e integração Admin/Orçamento.
- Aplicar migration e deploy somente `admin-whatsapp-ops-v1` se necessário.
- Smoke test templates e produto/handoff com dados controlados.
- Sincronizar latest main, limpar workflows temporários, merge e confirmar Pages.
