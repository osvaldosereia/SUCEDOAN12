# WhatsApp Flow Cestas Dona Antônia — checkpoint RUN9

Data: 2026-09-10

## Estado relido

- Candidato principal permanece `flow-cestas-comercial-v8-stable`.
- Meta Flow: `2579927222524475`, `DRAFT`, isolado de clientes.
- Runtime comercial permanece `handle_whatsapp_flow_commercial_exchange_v23`.
- Make continua com exatamente três cenários ativos autorizados: inbound controlado, outbound event-driven e consulta CPF, todos sem execuções incompletas.
- Gates globais confirmados: canary 1%; experience orchestrator OFF; Data Exchange global OFF; Flow send global OFF; commercial write OFF; Bling OFF.
- A sessão owner-only anterior `caf9452b-8df9-43f1-9487-cee2e9aff02a` venceu sem INIT/Data Exchange e agora está `abandoned`.
- A conversa owner-only continua `mode=human`, `human_required=true` e com handoff humano ativo. Nenhuma tentativa foi feita para contornar a precedência humana.

## Implementação desta rodada

### 1. Confirmação do CI da RUN8

O commit da correção de replay `nfm_reply` (`1e35f4bbd5f03764e7de10c4d6497c97d6a745ef`) teve o workflow `Test WhatsApp Flow V31 Runtime` concluído com `success`.

Isso confirma que a correção que elimina resposta genérica em replay duplicado não quebrou o contrato V31 existente.

### 2. Auditoria da cadeia Make -> Edge -> backend -> WhatsApp

A cadeia real foi relida:

1. `Dona Antônia - WhatsApp Inbound Controlado v1` recebe o evento Meta;
2. módulo HTTP envia `interactive.nfm_reply.response_json` para `whatsapp-ingest-make-v1`;
3. a Edge chama exclusivamente `process_whatsapp_flow_nfm_reply_v1` para `interactive_type=nfm_reply`;
4. o Make só entra no ramo `Responder texto` quando `should_reply=true` e `reply_type=text`;
5. replay duplicado agora retorna `should_reply=false`, `reply_type=none`, `reply_body=null`;
6. portanto não existe segundo envio de texto pelo cenário inbound nesse replay.

Não foi necessário alterar o Make nesta rodada.

### 3. Gate de idempotência terminal V31

Criadas e aplicadas:

- `get_whatsapp_flow_v31_nfm_replay_readiness_v1()`;
- `get_whatsapp_flow_v31_full_release_readiness_v4(uuid)`.

A primeira versão do diagnóstico revelou um erro de quoting interno ao ser executada. O erro ficou restrito à função de readiness e não afetou Flow, checkout ou clientes. A correção foi aplicada incrementalmente em:

- `20260910212400_whatsapp_flow_v31_nfm_replay_readiness_v4_fix.sql`.

Após a correção, o readiness de replay passou **8/8**:

- terminal readiness green;
- wrapper roteia para bridge comercial;
- dedupe por `message_id` presente;
- replay não solicita localização;
- replay não produz `reply_text`;
- pedido precisa estar `confirmed`, com `confirmed_at` e total positivo;
- retorno ao chat explícito;
- candidato V31 suportado.

A função declara `writes_executed=false`, `orders_created=false`, `pii_returned=false`.

### 4. Contrato de CI da Edge

Criado `scripts/test-whatsapp-flow-v31-nfm-replay-contract.mjs`.

Ele protege explicitamente:

- branch exclusivo para `interactive_type=nfm_reply`;
- RPC determinístico `process_whatsapp_flow_nfm_reply_v1`;
- `duplicate=true` ou `reply_text` vazio => resposta silenciosa;
- replay não pode conter `should_reply=true` nem `reply_type=text`;
- resposta inédita usa somente `flowReply.reply_text`;
- `ai_job=null` no retorno de Flow, evitando reinterpretação por IA;
- gates perigosos continuam proibidos no artefato de readiness.

O workflow `.github/workflows/test-whatsapp-flow-v31-runtime.yml` foi ampliado com as novas migrations e o novo contrato.

Run `34531991911`: **success**. Todos os passos, inclusive `Validate silent nfm replay contract`, passaram.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente foi exposto, nenhum rollout foi ampliado, nenhum pedido foi criado e nenhum handoff foi alterado.

## Próximo ponto

1. continuar reforçando a jornada comercial sem writes reais enquanto a conversa owner-only estiver sob controle humano;
2. revisar Data Exchange V23 para garantir que seleção por seção -> termo -> busca nunca ultrapasse os limites atuais e que a busca direta inferida pela IA reutilize o mesmo backend determinístico;
3. ampliar os testes de combinação entre personalização, extras e upsell/cross-sell para transições entre telas, inclusive voltar/editar/revisar sem duplicar linhas ou totais;
4. quando a conversa owner-only voltar naturalmente a `mode=ai` e sem handoff, emitir uma nova sessão curta de homologação e executar a jornada visual real ponta a ponta.

## Ação manual

Nenhuma ação manual indispensável neste momento. A sessão anterior expirou corretamente sem uso; uma nova sessão só deve ser emitida quando o preflight owner-only estiver realmente verde.
