# WhatsApp Flow Dona Antônia — RUN27 / V45

Data: 2026-09-11

## Objetivo da rodada

Continuar o Flow comercial único e dinâmico sem abrir rollout, conectando a intenção já entendida pela IA ao catálogo determinístico do Supabase. A IA continua sem autoridade sobre produto, preço, estoque ou regra comercial.

## Implementado

### V45 — intenção da IA -> Data Exchange determinístico

Foi criado `handle_whatsapp_flow_commercial_exchange_v26(...)`.

O novo caminho aceita somente o trigger interno `ai_intent_open_v1` em `MENU_[A-L]` ou `TERMOS_[A-L]` e somente no candidato `flow-cestas-comercial-v8-stable` em homologação owner-only.

Fluxo:

1. recebe somente o texto da intenção (`ai_intent`);
2. resolve por `get_whatsapp_flow_intent_products_v1`;
3. reutiliza `get_whatsapp_flow_nav_products_v1` para montar a navegação;
4. devolve `PRODUTOS_[A-L]` com produtos, fotos, preços e IDs reais;
5. mantém limite absoluto de 20 produtos por consulta;
6. persiste somente estado de navegação (`flow_browse_*`), sem criar pedido/carrinho comercial nesse caminho;
7. delega todas as demais ações integralmente ao V25.

Guardas no próprio RPC:

- definição obrigatoriamente `flow-cestas-comercial-v8-stable`;
- `ready`, `candidate_not_live=true`, `customer_exposure=false` e owner-homologation;
- sessão marcada owner-only;
- destinatário precisa coincidir com a sessão e estar em `whatsapp_test_allowlist` para `controlled_live_homologation`;
- transição somente a partir de `MENU`/`TERMOS`;
- subset entre 1 e 20 produtos.

### Smoke real com rollback

Foi executado teste transacional no Supabase usando somente a sessão owner-only autorizada. A intenção `sabonete` retornou:

- `ok=true`;
- tela `PRODUTOS_A`;
- 10 produtos reais;
- fotos e preços provenientes do backend;
- `query_source=curated_term`;
- `full_catalog_loaded=false`;
- `commercial_truth=backend_deterministic`.

A transação foi revertida ao final. Nenhuma sessão, carrinho, cliente ou pedido permaneceu alterado pelo smoke.

## Promoção do runtime

A promoção foi feita em duas fases para evitar drift:

1. V26 foi criado e mantido como `next_commercial_handler`, enquanto Edge 48 continuou em V25;
2. depois da validação de staging, o código do Edge foi atualizado e implantado como **Edge 49**, chamando V26 exclusivamente para `flow-cestas-comercial-v8-stable`.

Após o deploy, metadata/config foram promovidos juntos:

- `commercial_handler=handle_whatsapp_flow_commercial_exchange_v26`;
- `handler_version=v26`;
- `edge_version=49`;
- `runtime_edge_version=49`;
- `runtime_promotion_required=false`.

O V26 continua delegando todo o comportamento não relacionado ao novo trigger para V25, preservando personalização, extras, upsell, revisão e checkout existentes.

### Readiness pós-deploy

- `get_whatsapp_flow_v45_ai_intent_data_exchange_readiness_v1()` -> `ok=true`, 6/6;
- staging alignment -> `ok=true`, 5/5;
- `get_whatsapp_flow_v45_runtime_v26_readiness_v1()` -> `ok=true`, 7/7.

## Gates confirmados

Continuam exatamente bloqueados:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

Nenhum rollout foi aumentado, nenhum cliente foi exposto pelo candidato V8 e nenhum pedido foi criado pela rodada.

## Make

Auditoria da rodada encontrou somente `consultar no cpf` ativo. Nenhum cenário antigo do Flow foi reativado.

## Arquivos da rodada

- `supabase/migrations/20260911153000_whatsapp_flow_v45_ai_intent_data_exchange_v1.sql`
- `supabase/migrations/20260911154000_whatsapp_flow_v45_runtime_staging_alignment_v1.sql`
- `supabase/migrations/20260911155000_whatsapp_flow_v45_runtime_v26_promotion_v1.sql`
- `supabase/functions/whatsapp-flow-data-exchange-v1/index.ts`
- `scripts/test-whatsapp-flow-v45-ai-intent-data-exchange-contract.mjs`

## Próximo bloco seguro

1. executar regressão owner-only do runtime Edge 49/V26 cobrindo CESTAS -> PERSONALIZAÇÃO -> MENU/TERMOS -> intenção direta -> PRODUTOS -> produto/quantidade -> UPSELL -> REVISÃO;
2. continuar a evidência terminal até cadastro/endereço, FINALIZAR, `nfm_reply` e pedido de localização;
3. reconciliar/restaurar o artefato gerado `flow-cestas-comercial-v31-stable-text-products.json` pelo builder oficial antes de qualquer republicação Meta;
4. manter todos os gates globais bloqueados até evidência física completa.

## Ação manual

Nenhuma ação manual foi necessária para programação/deploy V45. A única etapa humana que continua pendente é a travessia física no WhatsApp owner-only para produzir evidência real do trecho terminal; não é necessário fazê-la para manter os gates bloqueados.
