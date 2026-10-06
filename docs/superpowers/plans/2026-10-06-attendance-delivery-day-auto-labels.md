# Etiquetas automáticas por dia de entrega — Plano de implementação

> **For agentic workers:** executar cada tarefa com testes antes da implementação; a Ana e qualquer envio automático ficam desligados.

**Goal:** Etiquetar conversas com o dia da entrega a partir da data estruturada do pedido, removendo a etiqueta automática antiga quando pedidos forem remarcados, cancelados ou entregues.

**Architecture:** As etiquetas manuais e automáticas terão tabelas de origem próprias, mantendo a tabela de relações existente como projeção lida pelo Admin. Uma função de sincronização recalculará as etiquetas de uma conversa a partir de pedidos ativos ligados explicitamente a ela; gatilhos de gravação de pedidos atualizarão a projeção de forma idempotente.

**Tech Stack:** PostgreSQL/Supabase, PL/pgSQL, testes de contrato Node.js e GitHub Actions.

**Spec:** pedido do usuário na conversa: organizar conversas por dia conforme a data agendada do pedido; preservar controle humano e evitar que a IA improvise.

## Global Constraints

- Fonte única da data: `orders.delivery_address->>'delivery_date'`, validada como data ISO.
- Só pedidos ativos com `conversation_id` explícito podem atribuir etiqueta.
- Datas passadas, pedidos entregues e cancelados não mantêm etiqueta automática.
- A sincronização não envia mensagens e não ativa a ANA.
- Etiquetas manuais nunca são removidas pela automação.
- A configuração de canais mantém `ana_enabled=false` e `campaigns_enabled=false`.

## Review Focus

- Reagendamento/cancelamento/entrega: recalcular e retirar somente etiqueta automática sem origem atual.
- Etiqueta manual igual a uma automática: manter até que a pessoa a remova manualmente.
- Pedido sem conversa ligada ou data inválida: não adivinhar conversa nem criar etiqueta.
- Mais de um pedido ativo em dias diferentes na mesma conversa: manter os dias válidos.
- Atualização idempotente e segura sob concorrência: evitar duplicatas por conversa/etiqueta.

---

### Task 1: Contrato de banco para etiquetas automáticas

**Files:**
- Create: `supabase/sql/20261006_attendance_delivery_day_auto_labels_v1.sql` (also redefines the Admin set-labels RPC)
- Test: `scripts/test-attendance-delivery-day-auto-labels-v1.mjs`
- Modify: `.github/workflows/attendance-papoai-send-ci.yml`

**Interfaces:**
- `attendance_conversation_manual_labels_v1`: etiquetas de controle humano.
- `attendance_conversation_auto_labels_v1`: etiquetas geradas, com origem e referência deduplicadas.
- `ops2_attendance_refresh_delivery_day_labels_v1(p_conversation_id uuid)`: recalcula dias de entrega ativos para uma conversa.
- `ops2_admin_attendance_set_labels_v1(uuid,uuid[])`: grava a seleção humana e recompõe a projeção manual + automática.

- [ ] Criar testes de contrato para a fonte estruturada, deduplicação, preservação manual, backfill e ausência de efeitos de envio.
- [ ] Executar o teste e confirmar falha antes da migração.
- [ ] Implementar tabelas protegidas, sete etiquetas de semana, backfill manual, sincronizador, backfill inicial e gatilho de pedidos.
- [ ] Executar o teste e a suíte de atendimento.

**Resultado esperado:** a fila do Admin mostra etiquetas corretas e atuais sem que a automação altere etiquetas manuais, envie mensagens ou ligue a Ana.
