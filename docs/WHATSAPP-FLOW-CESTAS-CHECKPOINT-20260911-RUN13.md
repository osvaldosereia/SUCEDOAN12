# WhatsApp Flow Cestas Dona Antônia — Checkpoint RUN13 — 2026-09-11

## Estado real relido

- O `main` permanece no candidato estável `flow-cestas-comercial-v8-stable`, com o endpoint V32 de replay já implantado.
- A sessão owner-only `836b1b60-8030-424a-aab3-c6f8f6a0969b` continua `open`, com `INIT` real observado e tela corrente `PERSONALIZAR`.
- A auditoria live ainda registra somente o replay histórico em `CESTAS`, ocorrido antes da promoção V32/V47. Nenhuma nova transição visual foi produzida no aparelho desde o checkpoint RUN12.
- `whatsapp-flow-data-exchange-v1` permanece `ACTIVE`, versão 47, `verify_jwt=false` conforme o protocolo criptográfico/allowlist da Meta.

## Implementação desta rodada

### Smoke transacional do replay cache V32

Foi criado e aplicado `get_whatsapp_flow_v32_replay_cache_smoke_v2()`.

O teste usa exclusivamente um registro sintético e efêmero em `whatsapp_flow_request_guard`, sem sessão, cliente, carrinho ou pedido. Ele valida:

1. primeira resposta cacheada com sucesso;
2. segunda tentativa para o mesmo fingerprint não substitui a primeira resposta;
3. `get_whatsapp_flow_replay_response_v1` devolve exatamente a primeira resposta;
4. `response_cached_at` é preenchido;
5. o registro sintético é removido antes do retorno;
6. nenhuma escrita comercial é executada e nenhuma PII é retornada.

Resultado real no Supabase:

```text
ok=true
first_response_immutable=true
replay_returns_first_response=true
cached_at_present=true
synthetic_guard_cleaned=true
commercial_writes_executed=false
pii_returned=false
```

Uma verificação posterior confirmou `synthetic_residue=0` para `request_id='v32-smoke'`.

Persistido no GitHub:

- `supabase/migrations/20260911002000_whatsapp_flow_v32_replay_cache_transactional_smoke_v2.sql`;
- `scripts/test-whatsapp-flow-v32-replay-cache-smoke-contract.mjs`;
- `.github/workflows/test-whatsapp-flow-v32-replay.yml` ampliado para executar o novo contrato.

O workflow `Test WhatsApp Flow V32 Replay`, run `34546004206`, foi disparado pelo commit do CI e estava `in_progress` no encerramento desta rodada; não declarar verde até conclusão explícita.

## Gates preservados

Confirmado diretamente em `public.automation_config`:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum gate foi alterado.

## Make

Reauditado. Permanecem exatamente três cenários ativos autorizados, todos com `incompleteExecutions=0`:

1. `Dona Antônia - WhatsApp Outbound Event-Driven v3` (`7290488`);
2. `Dona Antônia - WhatsApp Inbound Controlado v1` (`6779824`);
3. `consultar no cpf` (`6379567`).

Nenhuma alteração foi feita no Make.

## Próximo ponto exato

1. Confirmar o resultado final do CI V32 replay.
2. Continuar a sessão real a partir de `PERSONALIZAR` quando houver nova ação no aparelho.
3. Nas próximas transições novas, confirmar que `response_payload` e `response_cached_at` são gravados na primeira execução e que eventual replay retorna a resposta cacheada sem novo avanço de estado.
4. Prosseguir por `SECOES -> TERMOS/busca direta -> PRODUTOS -> PRODUTO -> UPSELL -> REVISAO -> CLIENTE -> FINALIZAR`.
5. Confirmar `nfm_reply`, retorno à conversa e pedido único de localização.
6. Manter todos os gates globais fechados até autorização explícita do proprietário.

## Ação manual indispensável

Para avançar a homologação visual real além de `PERSONALIZAR`, o proprietário precisa continuar o Flow já aberto no número de homologação autorizado. Nenhuma chave, configuração, alteração de Make ou mudança de rollout é necessária.
