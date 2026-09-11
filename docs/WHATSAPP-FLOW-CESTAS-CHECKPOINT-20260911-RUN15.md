# WhatsApp Flow Dona Antônia — Checkpoint RUN15

Data: 2026-09-11

## Objetivo

Continuar a homologação owner-only sem ampliar rollout e fortalecer o caminho de catálogo segmentado antes da próxima interação no aparelho.

## Estado preservado

Sessão owner-only: `836b1b60-8030-424a-aab3-c6f8f6a0969b`.

Antes das alterações desta rodada:

- `current_screen=PERSONALIZAR`;
- `next_expected=CUSTOMIZE_OR_CONTINUE`;
- `post_v32_error_count=0`;
- `post_v32_guard_count=0`;
- `runtime_ok=true`;
- `visual_homologation_complete=false`.

Gates confirmados:

- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Bug real encontrado e corrigido

A auditoria profunda detectou uma inconsistência de chave na seção Casa e Pet:

- `get_whatsapp_flow_sections_v1()` publica `utilidades_pet`;
- `get_whatsapp_flow_segmented_terms_v1()` aceitava apenas `casa_pet`;
- resultado: Casa e Pet aparecia como seção, mas poderia abrir sem termos.

Correção aplicada de forma compatível:

- `casa_pet` continua aceito como alias legado;
- ambos convergem internamente para `utilidades_pet`;
- o título permanece `Casa e pet`;
- a consulta usa os termos reais de `whatsapp_flow_search_terms`.

Migration:

`supabase/migrations/20260911031900_whatsapp_flow_v33_utilidades_pet_alias_fix_v1.sql`

## Readiness profundo de catálogo V33

Criada a função somente leitura:

`public.get_whatsapp_flow_v33_segmented_catalog_readiness_v1()`

Ela percorre:

1. seções macro reais;
2. termos efetivamente visíveis de cada seção;
3. `search_query` determinística de cada termo;
4. primeira página de produtos reais com limite fixo de 20;
5. preço, estoque e imagem dos produtos retornados.

Também valida que nenhuma página ultrapassa 20 produtos e declara explicitamente `full_catalog_loaded=false`.

Readiness owner consolidado:

`public.get_whatsapp_flow_v33_owner_homologation_readiness_v4(uuid)`

Resultado após a correção:

- `ok=true`;
- `segmented_catalog_ready=true`;
- `catalog_section_count=5`;
- `catalog_term_count=23`;
- `catalog_viable_term_count=23`;
- `catalog_sampled_product_count=202`;
- `catalog_max_products_per_page=20`;
- `catalog_invalid_product_count=0`;
- `full_catalog_loaded=false`;
- `post_v32_error_count=0`;
- tela atual `PERSONALIZAR`.

Observação: `catalog_sampled_product_count=202` é a soma das amostras de todas as 23 buscas independentes durante a auditoria server-side. O Flow continua carregando no máximo 20 produtos por busca/página e nunca os mais de 1.000 itens de uma vez.

Migration:

`supabase/migrations/20260911031800_whatsapp_flow_v33_segmented_catalog_readiness_v1.sql`

## Contrato/CI

Novo teste:

`scripts/test-whatsapp-flow-v33-segmented-catalog-contract.mjs`

Workflow atualizado:

`.github/workflows/test-whatsapp-flow-v31-live-audit.yml`

O contrato protege:

- limite de 20 produtos por página;
- estratégia seção → termo → busca dinâmica;
- ausência de catálogo completo;
- preço/estoque/imagem válidos;
- compatibilidade `casa_pet -> utilidades_pet`;
- service-role only;
- nenhuma escrita comercial;
- nenhuma PII.

## Make

Auditoria desta rodada encontrou exatamente três cenários ativos e autorizados, todos com `incompleteExecutions=0`:

1. `consultar no cpf`;
2. `Dona Antônia - WhatsApp Inbound Controlado v1`;
3. `Dona Antônia - WhatsApp Outbound Event-Driven v3`.

Nenhum cenário foi alterado.

## Próximo passo

Continuar a homologação visual no aparelho a partir de `PERSONALIZAR`. O backend está agora protegido contra a inconsistência Casa e Pet e o caminho segmentado real está validado antes do teste manual.

Após a próxima interação, verificar primeiro a criação de guard pós-V32 com resposta cacheada e seguir a jornada completa: personalização → seções/termos/busca → extras → upsell → revisão → cadastro/endereço → pagamento → finalizar → `nfm_reply` → localização.
