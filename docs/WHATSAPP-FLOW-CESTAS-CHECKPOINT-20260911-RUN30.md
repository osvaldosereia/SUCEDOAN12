# WhatsApp Flow Cestas — checkpoint RUN30 — 2026-09-11

## Objetivo da rodada
Eliminar a pendência de reprodutibilidade do artefato visual estável V31 sem alterar runtime, gates, rollout, pedidos ou exposição a clientes.

## Estado validado antes da alteração
- `get_whatsapp_flow_v47_terminal_contract_readiness_v1()` retornou `ok=true` com 10/10 checks verdes.
- Runtime comercial permanece `handle_whatsapp_flow_commercial_exchange_v26` / Edge 49.
- Gates preservados: canary 1%; Orchestrator OFF; Data Exchange OFF; Flow Send OFF; commercial write OFF; Bling OFF.
- Make continua com apenas `consultar no cpf` ativo e `incompleteExecutions=0`.

## Reprodutibilidade V31 restaurada
A pendência registrada nos checkpoints RUN25–RUN29 foi tratada sem reconstrução manual.

Foi criada uma branch isolada e uma rotina CI que:
1. usa exclusivamente o builder autoritativo `scripts/build-flow-v31-stable-text-products.py`;
2. usa como fonte `whatsapp/flows/flow-cestas-comercial-v6.json`;
3. gera `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`;
4. executa `scripts/validate-flow-v31-commercial-contract.py`;
5. executa o builder novamente e compara byte a byte o segundo resultado para provar geração determinística;
6. só então versiona o artefato gerado.

O checkout do CI foi ajustado para sparse checkout porque o repositório é grande; o segundo run concluiu com sucesso. O próprio GitHub Actions gerou e commitou o artefato, commit `6a6e422237a13b92aba53743a115ff2e75b7591a`.

## Segurança
Nenhum gate foi aberto. Nenhum pedido, cliente, carrinho, sessão física, outbound ou integração Bling foi criado/alterado por esta rodada. A restauração é apenas de artefato reproduzível no repositório.

## O que continua pendente
1. Evidência física real owner-only do trecho terminal: `UPSELL -> REVISAO -> CLIENTE/ENDERECO -> FINALIZAR -> nfm_reply -> localização`.
2. O próximo teste físico deve usar uma nova sessão owner-only, pois a sessão antiga de evidência está `abandoned`.
3. Antes de qualquer publicação/republicação na Meta, manter os gates fechados e exigir nova checagem final de release.

## Ação manual do proprietário
Nenhuma ação manual é necessária nesta rodada. A próxima ação humana indispensável continua sendo somente atravessar o Flow no número autorizado de homologação quando chegar o momento da evidência física.
