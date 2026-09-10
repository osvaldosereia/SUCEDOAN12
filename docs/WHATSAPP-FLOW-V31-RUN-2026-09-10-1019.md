# WhatsApp Flow Dona Antônia — execução 2026-09-10 10:19 UTC

## Estado confirmado

- Candidato: `flow-cestas-comercial-v8-stable`
- Meta Flow: `2579927222524475`
- Meta status: `DRAFT`
- Validação Meta: aprovada, 0 erros
- Handler: `handle_whatsapp_flow_commercial_exchange_v22`
- Flow JSON: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`
- Sessão owner-only vigente: `caf9452b-8df9-43f1-9487-cee2e9aff02a`
- Sessão: `offered`, ainda sem INIT/Data Exchange real nesta execução

## Implementado nesta execução

1. Criado `get_whatsapp_flow_v31_homologation_preflight_v1(uuid)`.
2. O preflight valida 28 invariantes antes de homologação: candidata existente/ready, Meta DRAFT, validação Meta, isolamento, produção desligada, handler V22, proibição de catálogo inteiro, limite de até 20 produtos, preços dos componentes ocultos, stock guard, upsell opcional, pagamento na entrega, canary 1%, orchestrator/Data Exchange/send/write/Bling desligados, allowlist ativa, chaves criptográficas, assinatura Meta, replay guard e, quando informada, validade/isolamento da sessão.
3. O preflight passou 28/28 verificações na sessão owner-only atual.
4. Criado `queue_and_dispatch_whatsapp_flow_owner_homologation_v3(...)`, que executa preflight antes do dispatch e novamente depois de criar/despachar a sessão. Em caso de drift, o novo caminho recusa ou aborta a homologação.
5. Ambas as funções são executáveis somente por `service_role`; `anon` e `authenticated` não têm EXECUTE.
6. Nenhuma nova mensagem foi enviada nesta rodada para evitar duplicar o DRAFT enquanto a sessão de 12h anterior permanece válida.
7. Make auditado: permanecem ativos somente inbound controlado, outbound event-driven e consulta CPF; todos com zero execuções incompletas.

## Gates finais preservados

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`

## Estado do smoke real

A sessão owner-only permanece válida até `2026-09-10T21:21:22.384331+00:00`, mas ainda possui `0` eventos em `whatsapp_flow_exchange_events`. Portanto a Meta ainda não enviou `INIT`; o passo externo pendente continua sendo abrir a mensagem DRAFT no aparelho autorizado e tocar em `Montar pedido`.

## Próximo passo técnico

Ao primeiro INIT real, auditar imediatamente os eventos criptografados e a transição completa: CESTAS -> PERSONALIZAÇÃO -> SEÇÕES/TERMOS -> PRODUTOS -> QUANTIDADE -> UPSELL -> REVISÃO -> CLIENTE/ENDEREÇO -> PAGAMENTO -> FINALIZAR -> `nfm_reply` -> pedido de localização no WhatsApp. Não publicar e não ampliar rollout antes da homologação completa.
