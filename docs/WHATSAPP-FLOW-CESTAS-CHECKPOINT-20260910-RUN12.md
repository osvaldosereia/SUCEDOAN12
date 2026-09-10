# WhatsApp Flow Cestas Dona Antônia — Checkpoint RUN12 — 2026-09-10

## Estado real relido

- A homologação owner-only avançou: a sessão `836b1b60-8030-424a-aab3-c6f8f6a0969b` está `open`, com `INIT` real observado e tela corrente `PERSONALIZAR`.
- O runtime chegou corretamente de `CESTAS` para `PERSONALIZAR`.
- Foi observado um replay histórico em `CESTAS` rejeitado como `flow_transition_invalid`; isso deixou o readiness V31 antigo em `20/21`, apesar dos demais gates e preflight estarem verdes.
- O `main` avançou concorrentemente para a correção V32 (PR #259), que adiciona cache imutável da primeira resposta por fingerprint e short-circuit do replay antes do handler comercial.
- A migration V32 já estava aplicada no Supabase (`response_payload`, `response_cached_at`, `cache_whatsapp_flow_response_v1`, `get_whatsapp_flow_replay_response_v1`).
- As duas requisições anteriores da sessão (`INIT` e primeira transição em `CESTAS`) são anteriores ao cache V32 e, por isso, corretamente não possuem `response_payload` retroativo.

## Implementação desta rodada

### Promoção do endpoint V32

A Edge Function `whatsapp-flow-data-exchange-v1` foi promovida a partir do código atual do `main`, incluindo `index.ts`, `crypto.ts`, `card-images.ts` e `image.ts`.

Estado implantado:

- versão Supabase Edge: **47**;
- status: `ACTIVE`;
- `verify_jwt=false`, preservado porque este endpoint é chamado pela Meta e usa o protocolo criptográfico/allowlist do WhatsApp Flow em vez de JWT do usuário;
- replay não-`ping` agora consulta a resposta cacheada e retorna exatamente a primeira resposta, sem executar novamente `handle_whatsapp_flow_commercial_exchange_v24`;
- resposta nova é cacheada somente após a primeira execução;
- resposta sem `screen` falha fechada;
- replay concorrente sem cache pronto retorna `flow_replay_response_pending` em vez de repetir a mutação de estado;
- hidratação visual é reaplicada sobre a resposta cacheada sem alterar o estado comercial.

### Segurança preservada

Nenhum gate global foi aberto e nenhum rollout foi aumentado. Permanecem obrigatoriamente:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

O preflight owner-only atual está verde: candidato isolado, número autorizado, conversa em IA, service window aberta e handoff humano limpo.

### Make

Reauditado após a promoção da Edge. Permanecem exatamente três cenários ativos autorizados e todos com `incompleteExecutions=0`:

1. `Dona Antônia - WhatsApp Outbound Event-Driven v3` (`7290488`);
2. `Dona Antônia - WhatsApp Inbound Controlado v1` (`6779824`);
3. `consultar no cpf` (`6379567`).

Nenhuma alteração foi feita no Make nesta rodada.

## Próximo ponto exato

1. Continuar a sessão real a partir de `PERSONALIZAR`.
2. O próximo Data Exchange novo já passará pela Edge V47/V32 e sua primeira resposta ficará cacheada.
3. Validar que eventual replay dessa nova requisição retorna a resposta cacheada e não produz novo `flow_transition_invalid` nem novo avanço de estado.
4. Prosseguir por `SECOES -> TERMOS/busca direta -> PRODUTOS -> PRODUTO -> UPSELL -> REVISAO -> CLIENTE -> FINALIZAR`.
5. Confirmar `nfm_reply`, retorno à conversa e pedido único de localização.
6. Somente após a jornada inteira ficar verde considerar qualquer mudança de gate, e apenas com autorização explícita do proprietário.

## Ação manual indispensável

Para continuar a homologação visual real, o proprietário precisa apenas prosseguir no Flow já aberto a partir da tela **PERSONALIZAR**. Nenhuma configuração, chave ou alteração de rollout é necessária neste momento.
