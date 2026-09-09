# WhatsApp Flow Cestas — Edge V11 / regressão V8 — 2026-09-09

## Concluído

- Edge Function `whatsapp-flow-data-exchange-v1` implantada no Supabase como versão 11 e conferida chamando `handle_whatsapp_flow_commercial_exchange_v8`.
- Navegação sintética com rollback validou `INIT -> CESTAS -> PERSONALIZAR_A -> SECOES_A -> TERMOS_A -> PRODUTOS_A -> PRODUTO_A` usando dados reais e no máximo 12 produtos por consulta.
- Busca direta por `sabonete` validada retornando somente subconjunto relevante.
- Adição real de um produto extra foi validada dentro de subtransação revertida: após `PRODUTO_A` o Flow avançou para `SECOES_B` e o total da revisão aumentou em relação ao preço da cesta.
- Checkout de cliente sem endereço avançou para `CLIENTE_NOVO`; checkout com endereço conhecido avançou para `CLIENTE_EXISTENTE` sem exigir recadastro.
- Finalização comercial foi validada em subtransação revertida: criou pedido `confirmed`, manteve Bling sem uso, retornou `FINALIZAR`, total final preenchido e orientação para enviar localização no WhatsApp.

## Defeito encontrado e corrigido

A composição oficial produz quantidades JSON como `1.000` porque a coluna é `numeric`. O validador aceitava apenas `1`, causando `basket_selection_invalid` quando a escrita comercial era realmente habilitada.

A migration `20260909171800_whatsapp_flow_integral_quantity_validation_v22.sql` passou a aceitar representações integrais `1`, `1.0`, `1.000` e continua rejeitando frações. A seleção padrão passou a `valid=true` com `issues=[]`.

O contrato foi adicionado a `scripts/test-whatsapp-new-order-flow-v1.mjs`. O workflow `Test Dona Antonia conversation worker`, run 624, concluiu com sucesso, inclusive `deno check` e testes de criptografia/imagem do Data Exchange.

## Segurança

Foi detectada no início da rodada uma alteração concorrente com gates comerciais ligados. O baseline foi restaurado imediatamente. Auditoria de `outbound_jobs` confirmou **zero jobs Flow criados ou enviados nos 30 minutos auditados**.

Estado final confirmado:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Os testes que exigiram escrita habilitaram os gates apenas dentro de subtransações com rollback deliberado; nenhum fixture, carrinho ou pedido de smoke permaneceu persistido.

## Próximo bloco

- alteração A/B/C de quantidade (retirar/diminuir/aumentar conforme política);
- upsell com produto efetivamente escolhido;
- `nfm_reply`/handoff de localização em regressão integrada;
- hidratação real das 9 imagens de cesta e imagens de produto pela Edge;
- preview Meta em aparelho de homologação, sem liberar clientes.
