# WhatsApp Flow Dona Antônia — execução 2026-09-10 08:15 UTC

## Continuidade

Candidato: `flow-cestas-comercial-v8-stable`
Meta Flow DRAFT: `2579927222524475`
Handler: `handle_whatsapp_flow_commercial_exchange_v22`
Base visual: `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`

## Implementado nesta execução

1. Auditados GitHub, Supabase e Make antes das alterações.
2. Os seis gates obrigatórios foram confirmados em `1 / false / false / false / false / false`.
3. Confirmado que a Meta continua chamando o endpoint de Data Exchange com `ping` real e resposta aceita.
4. Identificada uma sessão real anterior da V31 em `offered`, expirada sem `INIT`: o Flow foi enviado, mas não foi aberto/interagido.
5. Identificado um job antigo de Flow preso em `processing`, motivando hardening da homologação.
6. Criada migration `20260910081500_whatsapp_flow_v31_owner_homologation_atomic_smoke.sql` com:
   - `recover_whatsapp_flow_owner_homologation_stale_v1()`;
   - `queue_and_dispatch_whatsapp_flow_owner_homologation_v1()`;
   - allowlist obrigatória, gates globais travados, Meta DRAFT obrigatório, sessão owner-only e `service_role` exclusivo.
7. Executado novo smoke real pelo caminho atômico, somente para o número autorizado de homologação.
8. O Make executou a rota Flow com sucesso e a Meta Graph API respondeu HTTP 200 com novo `wamid`.
9. Identificada lacuna de reconciliação: o módulo 23 já devolvia `provider_message_id` ao webhook, mas o banco não consumia a resposta do `pg_net`.
10. Criada migration `20260910082100_whatsapp_flow_v31_owner_homologation_dispatch_reconcile.sql` com:
    - `reconcile_whatsapp_flow_owner_homologation_dispatches_v1()`;
    - reconciliação estritamente limitada a jobs V31 owner-only;
    - leitura da resposta `net._http_response`;
    - atualização para `sent` somente quando HTTP 2xx, `ok=true`, `job_id` confere, `interactive_type=flow` e há `provider_message_id`;
    - erro determinístico para respostas falhas;
    - cron `dona-antonia-flow-v31-owner-reconcile-v1` a cada minuto, junto da recuperação de jobs presos.
11. Reconciliação executada: `sent_reconciled=1`, `errors_reconciled=0`.
12. O novo job ficou `sent`, com `provider_message_id`, `dispatch_response_status=200` e sem erro.
13. A nova sessão permanece `offered`, `flow_exchange_count=0`, sem `INIT` até que o destinatário toque no Flow.

## Make

Continuam ativos somente:
- Dona Antônia - WhatsApp Inbound Controlado v1
- Dona Antônia - WhatsApp Outbound Event-Driven v3
- consultar no cpf

A execução do novo smoke utilizou apenas os módulos 1 -> 22 -> 23 da rota Flow e terminou com sucesso.

## Gates finais

- `whatsapp_live_canary_percent = 1`
- `experience_orchestrator_enabled = false`
- `whatsapp_flow_data_exchange_enabled = false`
- `whatsapp_flow_send_enabled = false`
- `whatsapp_flow_commercial_write_enabled = false`
- `bling_order_sync_enabled = false`

Nenhum rollout foi ampliado, nenhum Flow foi publicado e nenhum cliente foi exposto.

## Próximo passo

Aguardar somente a interação real no DRAFT enviado ao número autorizado. Quando houver `INIT`, validar Data Exchange ponta a ponta: CESTAS -> PERSONALIZAÇÃO -> SEÇÕES/TERMOS -> PRODUTOS -> QUANTIDADE -> UPSELL -> REVISÃO -> CLIENTE/ENDEREÇO -> PAGAMENTO -> FINALIZAR -> `nfm_reply` -> solicitação de localização. Enquanto não houver abertura, continuar aprimorando observabilidade e testes determinísticos sem tocar nos gates.