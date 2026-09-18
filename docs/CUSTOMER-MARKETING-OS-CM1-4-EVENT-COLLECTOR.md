# Customer & Marketing OS — CM-1.4 Event Collector

Atualizado em 18/09/2026.

Status: **V1 IMPLANTADA — COLETA DETERMINÍSTICA E IDEMPOTENTE ATIVA**.

## Objetivo

Transformar interações importantes em sinais confiáveis para Customer 360, atendimento, pós-venda e marketing, sem criar uma nova mega-tabela paralela.

## Estratégia

A arquitetura usa três níveis:

1. **eventos nativos de domínio** permanecem em suas tabelas próprias;
2. **customer_behavior_events** recebe eventos comportamentais normalizados adicionais;
3. **customer_timeline_v1** é o read model unificado para o Customer 360.

Assim pedidos continuam sendo pedidos, mensagens continuam sendo mensagens e eventos de catálogo continuam sendo eventos de catálogo.

## Event Collector canônico

Função:

`record_customer_event_v1`

Campos aceitos:

- customer_id;
- conversation_id;
- event_type;
- source;
- channel;
- provider;
- event_key;
- product_id;
- order_id;
- campaign_id;
- event_data;
- metadata;
- occurred_at.

## Idempotência

Foi criado índice único parcial:

`customer_behavior_events_source_key_uidx`

Chave:

`source + event_key`

Quando um evento com a mesma chave chega novamente:

- nenhuma segunda linha é criada;
- customer/conversation e referências podem ser enriquecidos;
- `event_data` é mesclado;
- `metadata` é mesclado;
- o id original é preservado.

## Segurança

`record_customer_event_v1` é server-only:

- sem EXECUTE para public;
- sem EXECUTE para anon;
- sem EXECUTE para authenticated;
- EXECUTE apenas por service_role.

## Timeline ampliada

`customer_timeline_v1` agora consolida:

- normalized_channel_events;
- messages legado quando ainda não normalizadas;
- orders;
- human_handoffs;
- operator_reply_jobs;
- customer_behavior_events;
- catalog_events;
- shopping_chat_trigger_events.

A view continua com `security_invoker=true`.

## PapoAI

O webhook PapoAI já alimenta `normalized_channel_events` quando há identificador externo da mensagem.

Isso significa que o transporte atual já começa a construir histórico no formato que será mantido após a futura troca para Meta direta.

## Smoke test executado no Supabase

Foi registrado o mesmo evento duas vezes com:

- mesma source;
- mesma event_key;
- payload diferente.

Resultado verificado:

- mesmo event_id nas duas chamadas;
- somente 1 linha persistida;
- payload atualizado/mesclado;
- metadata mesclada;
- somente 1 evento correspondente na timeline.

O registro de teste foi removido depois da validação.

## Custos

O collector não usa IA.

Custos por evento ficam limitados a operações normais de banco/Edge Function.

## Próximo passo

CM-1.5 — Consent Ledger e Customer Protection:

1. consolidar finalidade/canal/status;
2. criar decisão explicável de elegibilidade;
3. suppression por opt-out, consentimento, telefone e contexto;
4. bloquear disparos quando houver atendimento/pedido sensível;
5. manter campanhas em draft/approval até os guardrails estarem completos.
