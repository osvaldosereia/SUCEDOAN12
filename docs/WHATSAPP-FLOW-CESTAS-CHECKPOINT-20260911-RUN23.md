# WhatsApp Flow Cestas — checkpoint RUN23 / V41

Data: 11/09/2026.

## Concluído

- criado e aplicado no Supabase `get_whatsapp_flow_v41_physical_homologation_evidence_v1()`;
- o novo gate é somente leitura e mede exatamente qual trecho da homologação física owner-only ainda não possui evidência real;
- nenhuma escrita de carrinho/cliente/pedido é executada;
- nenhuma PII é retornada;
- nenhum gate de rollout é alterado;
- runtime stable permanece `v25`, Edge `48`;
- catálogo completo permanece proibido e o limite configurado continua em 20 produtos por consulta;
- contrato CI V41 adicionado ao workflow de auditoria do Flow.

## Evidência real atual

Sessão de referência:

```text
da005838-32c1-48da-a20f-a7d7ccc58bc2
```

Caminho físico observado:

```text
INIT -> CESTAS -> PERSONALIZAR_A -> SECOES_A -> SECOES_A -> TERMOS_A -> PRODUTOS_A
```

Resultado V41:

```text
ok=true
accepted_exchange_count=7
error_exchange_count=0
structural_terminal_ready=true
physical_flow_path_complete=false
missing_flow_evidence=[upsell,revisao,cliente_endereco,finalizar]
next_required_evidence=upsell
nfm_reply_physical_evidence_required=true
location_request_physical_evidence_required=true
writes_executed=false
orders_created=false
pii_returned=false
```

A quantidade/produto já possui evidência porque `PRODUTOS_A` foi alcançada com sucesso. O próximo checkpoint físico real é `UPSELL`.

## Gates preservados

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

## Make

Auditoria desta rodada encontrou somente `consultar no cpf` ativo. Os cenários antigos de inbound/outbound do Make não estão mais ativos, coerente com a migração recente do atendimento para PapoAI. Nenhum cenário Make foi ativado ou alterado nesta rodada.

## Próximo bloco seguro

1. observar passagem física owner-only por `UPSELL`;
2. seguir na mesma sessão para `REVISAO`;
3. validar `CLIENTE_EXISTENTE` ou `CLIENTE_NOVO`, sem pedir novamente dados já conhecidos;
4. validar `FINALIZAR` e forma de pagamento;
5. observar `nfm_reply` real e pedido de localização no WhatsApp;
6. manter todos os gates OFF e canary=1 até a evidência física completa e autorização explícita.
