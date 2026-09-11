# WhatsApp Flow Cestas — RUN28 / V46

## Objetivo
Atualizar o gate terminal de homologacao para o runtime atual `data-exchange-v26` / Edge 49, eliminando falsos negativos herdados do gate V42/V39 que ainda exigia V25/Edge 48, sem abrir rollout nem executar escrita comercial.

## Implementado
- Criado `public.get_whatsapp_flow_v46_terminal_regression_readiness_v1()` como gate read-only e `service_role` only.
- O gate compoe o readiness V45 e valida o runtime atual V26/Edge49.
- Mantidos os limites de catalogo: `default_products_per_query <= 20`, `max_products_per_query <= 20`, `never_load_full_catalog=true`, `full_catalog_load_forbidden=true` e IA sem autoridade de catalogo.
- Mantida a privacidade de precos dos componentes da cesta (`component_prices_visible=false`).
- Validada a presenca dos contratos de checkout/cadastro, finalizacao, `nfm_reply`, follow-up de localizacao e outbound nativo do Flow.
- Todos os gates globais seguem fechados: canary 1%, Orchestrator OFF, Data Exchange OFF, Flow Send OFF, commercial write OFF e Bling OFF.
- Corrigido o criterio de evidencia owner-only para selecionar a sessao fisica mais avancada por `flow_exchange_count/state_version`, e nao uma sessao vazia apenas por ser mais recente.

## TDD / verificacao
- RED: chamada inicial de `get_whatsapp_flow_v46_terminal_regression_readiness_v1()` falhou porque a funcao ainda nao existia.
- GREEN estrutural: V46 retornou `ok=true`.
- RED de regressao: o primeiro criterio escolheu uma sessao owner-only vazia e o teste `exchange_count >= 7` retornou `false`.
- GREEN apos correcao: o mesmo teste retornou `true`; o gate passou a recuperar a sessao `da005838-32c1-48da-a20f-a7d7ccc58bc2` com 7 exchanges, state version 6 e evidencia fisica ate PRODUTO/PRODUTOS_A.
- Contrato estatico `scripts/test-whatsapp-flow-v46-terminal-regression-contract.mjs` executado com sucesso.

## Estado externo
- Make: somente `consultar no cpf` ativo; `incompleteExecutions=0` na auditoria desta rodada.
- Supabase: projeto ACTIVE_HEALTHY.
- Advisor de seguranca executado depois das migrations; nao surgiu alerta novo associado a V46. Permanecem findings preexistentes fora do escopo desta rodada.

## Evidencia fisica
A melhor sessao real continua com 7 exchanges. Nao foi fabricada evidencia terminal e nenhum pedido foi criado para forcar homologacao.

Trecho fisico ainda pendente:
`UPSELL -> REVISAO -> CLIENTE/ENDERECO -> FINALIZAR -> nfm_reply -> localizacao`.

## Gates preservados
- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

## Pendencias seguintes
1. Continuar a regressao owner-only do trecho terminal no numero de homologacao autorizado.
2. Restaurar o artefato `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json` exclusivamente pelo builder oficial e validar pelo contrato V31 antes de qualquer republicacao.
3. Nao abrir gates, nao aumentar rollout e nao expor clientes sem autorizacao explicita.
