# WhatsApp Flow Cestas Dona Antônia — Checkpoint RUN10 — 2026-09-10

## Estado alcançado

O candidato isolado `flow-cestas-comercial-v8-stable` continua em `ready` local / `DRAFT` na Meta, sem exposição geral a clientes e com todos os gates globais de Flow/Bling mantidos fechados.

Nesta rodada o runtime comercial avançou de V23 para V24, corrigindo dois pontos de integridade encontrados durante a regressão:

1. A prévia antiga partia do preço-base da cesta e somava extras/upsell, mas não reaplicava explicitamente o `commercial_delta` da personalização. O novo `format_whatsapp_flow_session_preview_v2` usa `flow_basket_selection`, `validate_basket_flow_selection_v1` e a mesma fórmula de `remove_unit_delta` / `add_unit_delta` usada pelo carrinho real.
2. `flow_pending_addons` podia acumular o mesmo `product_id` em entradas separadas quando o cliente voltava e adicionava novamente o mesmo item. `normalize_whatsapp_flow_pending_addons_v1` agora agrupa por produto, revalida produto/WhatsApp/preço/estoque e limita quantidade a `min(soma, 6, estoque)`.

O runtime `handle_whatsapp_flow_commercial_exchange_v24` continua encadeando V23, normaliza os extras pendentes no modo de homologação sem escrita comercial e substitui a prévia de `REVISAO` e `FINALIZAR` pela V2, mantendo os preços individuais dos componentes da cesta ocultos.

## Regressões e gates

`get_whatsapp_flow_v31_navigation_integrity_readiness_v1()` passou 15/15:

- runtime V24 encadeia V23;
- seleção da cesta validada pelo backend;
- fórmula de redução e aumento igual à do carrinho;
- preços individuais dos componentes continuam ocultos;
- extras repetidos são consolidados;
- quantidade continua limitada a 6 e ao estoque;
- amostra duplicada 1 + 2 consolidou em quantidade 3;
- busca direta por `sabonete` permaneceu limitada a <= 12 produtos;
- todos os gates globais permaneceram fechados.

O full readiness V6, já exigindo o novo preflight V24/Edge 45, passou **21/21**, com `healthy=true`, `homologation_ready=true` e `ok=true` para a sessão owner-only atual.

Readiness complementares continuam verdes: jornada comercial 20/20, behavioral catalog 10/10, transactional read-only 16/16, deep read-only 14/14, silent `nfm_reply` replay 8/8 e navigation integrity 15/15.

## Edge / Data Exchange

A Edge `whatsapp-flow-data-exchange-v1` foi promovida para **versão 45**. O slug estável V31 agora chama exclusivamente `handle_whatsapp_flow_commercial_exchange_v24`.

O bypass de gates globais continua permitido somente para sessão owner-only explicitamente marcada, definição candidata isolada e número de homologação correspondente. Demais sessões continuam recebendo bloqueio fail-closed.

## Preflight owner-only V24

Foi criado `get_whatsapp_flow_v31_homologation_preflight_v4`, mantendo o preflight de conversa já existente e acrescentando:

- `runtime_v24_present`;
- `candidate_metadata_v24`;
- `data_exchange_edge_v45`.

Foi criado `queue_and_dispatch_whatsapp_flow_owner_homologation_v7`, que renova a lease já autorizada, exige o preflight V4, usa diretamente a fundação owner-only V2 para emissão/queue/dispatch e exige novamente o preflight V4 depois da criação da sessão. Isso evita depender dos wrappers históricos V3/V5 que congelaram nomes de handlers antigos.

## Homologação real no número autorizado

A conversa owner-only saiu naturalmente do modo humano e foi encontrada em:

- `mode=ai`;
- `human_required=false`;
- janela de serviço aberta;
- nenhum handoff `open/claimed`.

Com isso o preflight ficou verde e uma nova sessão isolada foi criada:

- session: `836b1b60-8030-424a-aab3-c6f8f6a0969b`;
- outbound: `09f7fe1f-7c0c-4173-afdd-6ff1e4b0f39d`.

O primeiro envio chegou ao cenário Make, mas a Meta respondeu HTTP 400. A comparação com o último envio V31 aceito revelou a causa exata: o módulo owner-only havia perdido `mode: "draft"` nos parâmetros do Flow. Como o candidato ainda está `DRAFT`, essa propriedade é necessária.

O cenário Make `Dona Antônia - WhatsApp Outbound Event-Driven v3` foi corrigido **somente no módulo 22 / rota owner-only V31**, restaurando `mode: "draft"`. O filtro segue exigindo `flow_id=2579927222524475`, `flow_action=data_exchange` e `homologation_session_id`.

O mesmo outbound protegido foi reenviado. A execução Make `974ecf7c0dc14b4a9993010572744882` terminou com sucesso, a Meta respondeu **HTTP 200** e devolveu `provider_message_id`. O job foi reconciliado para `status=sent`, `last_error=null` e `dispatch_response_status=200`.

Portanto, nesta rodada houve pela primeira vez um **envio real confirmado pela Meta do Flow V31/V24 apenas ao número de homologação autorizado**, sem abrir qualquer gate global.

## Estado da sessão após envio

No último fechamento desta rodada a sessão continua:

- `status=offered`;
- `opened_at=null`;
- `flow_current_screen=null`;
- `flow_state_version=0`;
- `flow_exchange_count=0`;
- sem `INIT` ainda;
- `next_expected=OPEN_FLOW`.

Ou seja: o envio ao aparelho foi confirmado, mas a jornada visual real ainda não foi percorrida. Não declarar homologação visual concluída até existirem eventos Data Exchange reais.

## Gates preservados

- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

Nenhum rollout geral foi aumentado e nenhum cliente fora do número owner-only foi exposto.

## Make

O cenário 7290488 permanece `active`, `incompleteExecutions=0`, sem espera por execução incompleta. A alteração desta rodada foi restrita ao JSON do módulo 22 owner-only para restaurar `mode: "draft"`.

## CI

O primeiro CI após a promoção V24 falhou em um contrato histórico que ainda esperava V23 na Edge. O runtime real, o Supabase e o envio Meta não falharam. O teste `scripts/test-whatsapp-flow-v31-runtime-contract.mjs` foi atualizado para exigir V24, manter V23 como camada histórica e negar regressão do bloco estável para V23/V22. O novo CI deve ser confirmado antes de declarar a trilha verde.

## Próximo ponto exato

1. Confirmar CI do commit que alinhou o contrato V24.
2. Aguardar/observar `INIT` da sessão real owner-only.
3. Quando o Flow for aberto, auditar a sequência real: `CESTAS -> PERSONALIZAR -> SECOES -> TERMOS -> PRODUTOS -> PRODUTO -> UPSELL -> REVISAO -> CLIENTE_EXISTENTE/NOVO -> PAGAMENTO -> FINALIZAR`.
4. Confirmar que voltar/editar não duplica extras e que total de revisão permanece igual ao cálculo do carrinho.
5. Completar a jornada real somente no owner, validar `nfm_reply` e depois o pedido de localização no WhatsApp.
6. Não ativar gates globais nem Bling até a homologação integral estar concluída e houver autorização explícita.

## Ação manual realmente necessária

Para a **homologação visual em aparelho**, o proprietário precisa abrir a mensagem de teste recebida no WhatsApp autorizado e tocar em **Montar pedido**, percorrendo o Flow. A infraestrutura técnica pode continuar sendo aprimorada sem isso, mas a validação real de UI/Data Exchange no aparelho depende dessa interação humana.
