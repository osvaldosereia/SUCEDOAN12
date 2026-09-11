# WhatsApp Flow Dona Antônia — RUN27 / V45

Data: 2026-09-11

## Objetivo da rodada

Continuar o Flow comercial único e dinâmico sem abrir rollout, conectando a intenção já entendida pela IA ao catálogo determinístico do Supabase. A IA continua sem autoridade sobre produto, preço, estoque ou regra comercial.

## Implementado

### V45 — intenção da IA -> Data Exchange determinístico

Foi criado `handle_whatsapp_flow_commercial_exchange_v26(...)`.

O novo caminho aceita somente o trigger interno `ai_intent_open_v1` em `MENU_[A-L]` ou `TERMOS_[A-L]` e somente no candidato `flow-cestas-comercial-v8-stable` em homologação owner-only.

Fluxo do resolver:

1. recebe apenas o texto da intenção (`ai_intent`);
2. resolve a intenção por `get_whatsapp_flow_intent_products_v1`;
3. usa a busca/paginação já existente `get_whatsapp_flow_nav_products_v1`;
4. devolve `PRODUTOS_[A-L]` com produtos reais, preços reais e IDs reais;
5. mantém máximo absoluto de 20 produtos por consulta;
6. persiste somente estado de navegação da sessão (`flow_browse_*`), nunca pedido/carrinho comercial nesse caminho;
7. para todas as demais ações delega integralmente ao V25.

Guardas adicionais no próprio RPC:

- definição precisa ser `flow-cestas-comercial-v8-stable`;
- definição precisa continuar `ready`, `candidate_not_live=true`, `customer_exposure=false` e owner-homologation;
- sessão precisa ser owner-only;
- destinatário precisa coincidir com a sessão e estar em `whatsapp_test_allowlist` com propósito `controlled_live_homologation`;
- transição só é aceita a partir de `MENU`/`TERMOS`;
- subset precisa conter entre 1 e 20 produtos.

### Smoke real com rollback

Foi executado teste transacional no Supabase usando a conversa/sessão owner-only autorizada. A intenção `sabonete` retornou:

- `ok=true`;
- tela `PRODUTOS_A`;
- 10 produtos reais;
- fotos e preços provenientes do backend;
- `query_source=curated_term`;
- `full_catalog_loaded=false`;
- `commercial_truth=backend_deterministic`.

A transação foi revertida ao final. Nenhuma sessão, carrinho, cliente ou pedido permaneceu alterado pelo smoke.

### Readiness

`get_whatsapp_flow_v45_ai_intent_data_exchange_readiness_v1()` retornou `ok=true` com 6/6 checks verdes.

Depois do teste, foi aplicada a camada de staging `get_whatsapp_flow_v45_runtime_alignment_readiness_v1()`, também `ok=true` com 5/5 checks verdes.

## Runtime e promoção

O RPC V26 está pronto no banco, mas **não foi promovido ainda no Edge**. O runtime implantado continua Edge 48 chamando V25.

Para evitar divergência silenciosa, a definição estável foi explicitamente mantida com:

- `commercial_handler=handle_whatsapp_flow_commercial_exchange_v25`;
- `handler_version=v25`;
- `next_commercial_handler=handle_whatsapp_flow_commercial_exchange_v26`;
- `next_handler_version=v26`;
- `runtime_promotion_required=true`.

A próxima promoção deve atualizar código do Edge + deploy + metadata juntos, e somente depois executar regressão owner-only.

## Gates confirmados

Continuam exatamente bloqueados:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

Nenhum rollout foi aumentado e nenhum cliente foi exposto pelo candidato V8.

## Make

Auditoria da rodada encontrou somente `consultar no cpf` ativo. Nenhum cenário antigo do Flow foi reativado.

## Arquivos desta rodada

- `supabase/migrations/20260911153000_whatsapp_flow_v45_ai_intent_data_exchange_v1.sql`
- `supabase/migrations/20260911154000_whatsapp_flow_v45_runtime_staging_alignment_v1.sql`
- `scripts/test-whatsapp-flow-v45-ai-intent-data-exchange-contract.mjs`

## Próximo bloco seguro

1. promover o Edge de 48 para uma nova versão chamando V26 exclusivamente para `flow-cestas-comercial-v8-stable`;
2. atualizar metadata V25 -> V26 na mesma promoção;
3. executar regressão owner-only de CESTAS -> PERSONALIZAÇÃO -> MENU/TERMOS -> busca por intenção -> PRODUTOS -> produto/quantidade -> UPSELL -> REVISÃO;
4. continuar homologação terminal até cadastro/endereço, FINALIZAR, `nfm_reply` e pedido de localização;
5. manter todos os gates globais bloqueados até evidência física completa.

## Ação manual

Nenhuma ação manual é necessária para o bloco de programação V45. A única ação humana futura continua sendo a travessia física no WhatsApp owner-only quando o runtime V26 estiver promovido e o teste real for retomado.
