# WhatsApp Flow Dona Antônia — execução 2026-09-10 09:21 UTC

## Estado confirmado

- Candidato: `flow-cestas-comercial-v8-stable`
- Meta Flow DRAFT: `2579927222524475`
- Handler: `handle_whatsapp_flow_commercial_exchange_v22`
- Base visual: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`
- Make ativo somente em: inbound controlado, outbound event-driven e consulta CPF; zero execuções incompletas.

## Diagnóstico desta execução

Os dois últimos envios owner-only expiraram sem `INIT`/Data Exchange real. O motivo operacional é que a sessão de homologação tinha apenas 30 minutos de validade; como a interação depende de o proprietário abrir a mensagem no aparelho, essa janela era curta demais para homologação assistida.

## Implementado

1. Criada `queue_and_dispatch_whatsapp_flow_owner_homologation_v2(...)`.
2. A V2 reutiliza todos os guards da V1 (gates fechados, allowlist, candidata DRAFT, owner-only, provider correto) e amplia somente a sessão de homologação autorizada para 12 horas.
3. A função V2 é executável exclusivamente por `service_role`; `anon` e `authenticated` não possuem EXECUTE.
4. A allowlist do número autorizado permanece ativa.
5. Foi realizado novo envio real DRAFT pelo caminho V2.
6. O dispatch retornou `ok=true` e `request_id=197`.
7. A reconciliação retornou `sent_reconciled=1`, `errors_reconciled=0`.
8. O job `ac0746d3-bcad-4661-8eac-2241c8ece3db` terminou em `sent`, com `provider_message_id` Meta e sem erro.
9. A sessão `caf9452b-8df9-43f1-9487-cee2e9aff02a` ficou válida até `2026-09-10T21:21:22.384331+00:00`.

## Gates finais

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`

Nenhum rollout foi ampliado, nenhum Flow foi publicado e nenhum cliente foi exposto.

## Próximo passo

Quando houver `INIT` real nessa sessão, auditar imediatamente `whatsapp_flow_exchange_events` e a sessão para validar tela a tela: CESTAS -> PERSONALIZAÇÃO -> SEÇÕES/TERMOS -> PRODUTOS -> QUANTIDADE -> UPSELL -> REVISÃO -> CLIENTE/ENDEREÇO -> PAGAMENTO -> FINALIZAR -> `nfm_reply` -> solicitação de localização.
