# WhatsApp Flow Cestas — Run 10 — Data Exchange V4 — 2026-09-09

## Objetivo

Alinhar o endpoint real de Data Exchange ao Flow visual V5, validar a jornada comercial completa em modo seguro e eliminar rotas segmentadas que poderiam levar a seletores de produtos vazios em um Flow forward-only.

## Implementação concluída

### Edge Function `whatsapp-flow-data-exchange-v1`

O endpoint comercial agora encaminha `flow-cestas-comercial-v1` para `handle_whatsapp_flow_commercial_exchange_v4`, em vez de chamar diretamente o handler V3.

A hidratação de imagem também reconhece as telas desenroladas `PRODUTO_1`, `PRODUTO_2` e `PRODUTO_3`, além do nome canônico `PRODUTO`.

O fail-closed foi preservado: qualquer chamada não-`ping` continua recusada quando `whatsapp_flow_data_exchange_enabled=false`.

Deploy realizado no Supabase como versão 4 da Edge Function. Nenhum gate comercial foi ativado.

### Handler V4

O handler V4 já existente foi confirmado no banco e permanece responsável por mapear as telas visuais forward-only:

```text
SECOES_1 / TERMOS_1 / PRODUTOS_1 / PRODUTO_1
SECOES_2 / TERMOS_2 / PRODUTOS_2 / PRODUTO_2
SECOES_3 / TERMOS_3 / PRODUTOS_3 / PRODUTO_3
```

para os handlers determinísticos V3/V2/V1 e retornar ao Flow a próxima tela desenrolada correta.

### Busca segmentada sem becos sem saída

Foi criada a migration `20260909142500_whatsapp_flow_available_search_terms_v1.sql`.

`get_whatsapp_flow_search_terms_v1` agora só apresenta um termo se a consulta determinística daquele termo possuir pelo menos um produto vendável no momento.

`get_whatsapp_flow_sections_v1` também omite uma seção macro quando nenhum de seus termos possui produto vendável.

Isso evita que o cliente avance para `PRODUTOS_n` com um dropdown vazio — especialmente importante porque o Flow V5 usa roteamento forward-only.

A busca direta continua independente e limitada; nenhum catálogo completo é carregado.

Auditoria após a mudança:

- 5 seções macro disponíveis;
- 23 termos segmentados disponíveis;
- 0 termos apresentados com resultado vazio.

## Testes funcionais seguros

Foi executada uma sessão temporária diretamente contra o handler V4, com escrita comercial desligada. A sessão foi apagada no final do teste.

Jornada validada:

```text
CESTAS
→ PERSONALIZAR
→ SECOES_1
→ PRODUTOS_1
→ PRODUTO_1
→ SECOES_2
→ PRODUTOS_2
→ PRODUTO_2
→ SECOES_3
→ UPSELL
→ REVISAO
→ CLIENTE
→ FINALIZAR
```

Foram usadas buscas reais do backend (`sabonete` e `arroz`) e produtos/preços reais do Supabase. O resultado final confirmou `write_enabled=false`.

Também foi testado o caminho segmentado:

```text
SECOES_1 → Higiene → Sabonete → PRODUTOS_1
```

A resposta retornou 10 produtos reais e não vazios.

Não ficaram sessões artificiais de teste no banco.

## Contrato estático

Foi adicionado `scripts/test-whatsapp-flow-data-exchange-v5.mjs`, cobrindo:

- Edge → handler V4;
- telas desenroladas V5;
- hidratação de `PRODUTO_1..3`;
- pesquisa direta e por termos;
- fail-closed do Data Exchange;
- manutenção explícita dos gates de segurança.

## Make auditado

### Outbound

`Dona Antônia - WhatsApp Outbound Event-Driven v3` já possui rota específica para `interactive.type=flow`, enviando pela Cloud API:

- `flow_message_version`;
- `flow_token`;
- `flow_id`;
- `flow_cta`;
- `flow_action`.

### Inbound / `nfm_reply`

`Dona Antônia - WhatsApp Inbound Controlado v1` preserva:

- `interactive.nfm_reply.body`;
- `interactive.nfm_reply.response_json`.

O bridge do Supabase processa o retorno via `process_whatsapp_flow_nfm_reply_v1`. O contrato existente após conclusão continua orientando o cliente a enviar a localização no WhatsApp para confirmar o ponto de entrega.

Dois cenários temporários de validação Meta que estavam ativos foram desativados após a auditoria.

## Gates confirmados após todas as alterações

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Nenhum cliente foi exposto ao Flow e nenhuma escrita de pedido/Bling foi autorizada.

## Pendência prioritária

### Fotos de produtos

O banco possui atualmente 351 URLs de imagem de produto e a auditoria encontrou todas em `.webp`. O componente de imagem do Flow precisa receber uma representação compatível; a Edge atual só converte em base64 quando a origem já é JPEG/PNG, portanto as fotos ainda não estão homologadas visualmente.

A próxima implementação deve criar uma conversão/cache segura WebP → JPEG/PNG para uso exclusivo do Flow, com limite de tamanho, sem alterar as imagens originais e sem converter o catálogo inteiro em cada requisição.

## Estado ao final

Backend V4 alinhado ao visual V5, busca direta e segmentada funcional, dois ciclos de adicionais testados, terceiro estágio/saída para upsell validado, revisão/cliente/finalização em preview validados, outbound Flow e inbound `nfm_reply` auditados, e todos os gates continuam desligados.

Nenhuma ação manual do proprietário é necessária neste ponto.
