# WhatsApp Flow Cestas Dona Antônia — checkpoint RUN4

Data: 2026-09-10

## Estado relido

- Repositório oficial: `osvaldosereia/SUCEDOAN12`.
- Candidato principal: `flow-cestas-comercial-v8-stable`.
- Meta Flow ID: `2579927222524475`.
- Flow JSON: `v31-stable-text-products`, Meta `DRAFT`, validação Meta sem erros.
- Sessão owner-only existente: `caf9452b-8df9-43f1-9487-cee2e9aff02a`, ainda `offered`, sem `INIT`/Data Exchange e sem erro.
- Outbound da sessão já enviado uma vez, HTTP 200; nenhuma nova mensagem de Flow foi criada nesta rodada.
- Make: somente os três cenários autorizados permanecem ativos, sem execuções incompletas: outbound event-driven, inbound controlado e consulta CPF.

## Implementação desta rodada

### Runtime V23 — checkout canônico

Criado `handle_whatsapp_flow_commercial_exchange_v23`, como camada segura sobre V22.

Na transição para cadastro/endereço:

- usa `get_whatsapp_checkout_contact_v1` como fonte canônica;
- cliente conhecido + dados base/endereço completos vai para `CLIENTE_EXISTENTE` e apenas confirma entrega/pagamento;
- cliente novo ou conhecido com cadastro incompleto vai para `CLIENTE_NOVO`;
- dados já conhecidos são pré-preenchidos e somente o que falta precisa ser completado;
- formas de pagamento do Flow incluem PIX, dinheiro, crédito/débito e alimentação/refeição, mantendo pagamento na entrega;
- nenhum dado comercial é inventado pela IA.

### Catálogo grande — prova permanente de subconjunto

Criado `get_whatsapp_flow_v31_commercial_journey_readiness_v1`.

Readiness em produção: **20/20**.

Verifica explicitamente:

- nunca carregar catálogo inteiro;
- busca padrão limitada a 12 produtos;
- teto absoluto de 20 produtos por resposta;
- no máximo 3 seções macro por rodada;
- busca direta limitada e validada;
- termos/subseções provenientes do banco e convertidos em buscas reais;
- estoque validado no runtime;
- preço dos extras vindo do backend;
- componentes da cesta sem preço individual;
- upsell/cross-sell opcional limitado a 6 sugestões;
- checkout por fonte canônica de cliente/endereço;
- cliente completo não é interrogado novamente;
- cliente incompleto recebe prefill dos dados existentes.

Estratégia comprovada: `seção macro -> termo dinâmico -> busca limitada no backend`, com busca direta quando a intenção já está clara.

### Data Exchange

A Edge Function `whatsapp-flow-data-exchange-v1` foi promovida para a versão 44.

Para `flow-cestas-comercial-v8-stable`, ela agora chama exclusivamente `handle_whatsapp_flow_commercial_exchange_v23`. Os guards owner-only, criptografia, replay guard e isolamento continuam iguais.

Metadata do candidato foi alinhada para:

- `handler_version=v23`;
- `edge_version=44`;
- checkout source = `get_whatsapp_checkout_contact_v1`;
- candidato continua DRAFT, não-live e fora das sessões comuns.

### CI

O contrato `scripts/test-whatsapp-flow-v31-runtime-contract.mjs` passou a validar V23, catálogo limitado, checkout canônico, terminal `nfm_reply`, imagens, crypto e gates.

Workflow `Test WhatsApp Flow V31 Runtime`, run `34502417324`: **success**.

### Auditoria V4

Criado `get_whatsapp_flow_v31_journey_audit_v4` para separar:

- `healthy`: saúde técnica do Flow/runtime;
- `homologation_ready`: se a conversa owner-only está operacionalmente liberada para teste.

Resultado atual:

- `healthy=true`;
- journey readiness `20/20`;
- `homologation_ready=false` somente porque a conversa do número autorizado está agora em `mode=human` e existe handoff humano ativo;
- session ainda `offered`, `exchange_count=0`, `next_expected=OPEN_FLOW`.

Não foi alterado o modo humano e o handoff não foi encerrado à força.

## Gates preservados

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhum cliente foi exposto e o rollout não foi aumentado.

## Próximo ponto

Continuar a regressão e homologação owner-only da jornada real:

`cesta -> personalização -> seção/termo/busca -> extras -> upsell/cross-sell -> revisão -> cadastro/endereço -> pagamento -> finalizar -> nfm_reply -> localização`.

Não reenviar Flow enquanto a conversa autorizada estiver sob controle humano/handoff. Quando esse controle estiver naturalmente liberado, usar somente o número já autorizado para a homologação real.

## Ação manual

Nenhuma ação manual é indispensável agora. Para a homologação visual ponta a ponta, em momento seguro e sem handoff humano ativo, será necessário abrir e operar o Flow no aparelho autorizado.