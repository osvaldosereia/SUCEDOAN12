# WhatsApp Flow Cestas — checkpoint RUN41 / visual fallback V58

## Objetivo desta rodada
Melhorar a disponibilidade de fotos reais de produtos no Flow sem carregar o catálogo inteiro, sem abrir nenhum gate global e sem introduzir fetch arbitrário/SSRF no Data Exchange.

## Estado relido antes da alteração
- RUN40 / V57 presente no `main`.
- candidato: `flow-cestas-comercial-v8-stable`.
- handler comercial: `handle_whatsapp_flow_commercial_exchange_v26`.
- evidência física V56 ainda pendente a partir de `UPSELL`.
- `eligible_owner_conversations=0`.
- `active_owner_homologation_sessions=0`.
- gates: canary 1%; Orchestrator OFF; Data Exchange OFF; Flow Send OFF; commercial write OFF; Bling OFF.
- Make: somente `consultar no cpf` ativo; `incompleteExecutions=0`.

## Diagnóstico de imagens
- 740 produtos ativos no banco.
- 739 possuem `image_url`.
- bucket `whatsapp-flow-assets`: 328 objetos, sendo 319 assets de produtos e 9 de cestas.
- portanto, o cache específico do Flow cobre apenas parte dos produtos ativos.
- o runtime anterior só carregava foto de detalhe quando existia `whatsapp-flow-assets/products/<uuid>.jpg`; o `image_url` real era deliberadamente ignorado.

## Implementação V58 — fallback visual confiável
Atualizado `supabase/functions/whatsapp-flow-data-exchange-v1/image.ts`.

Ordem de resolução da foto de detalhe:
1. tentar primeiro o asset cacheado `whatsapp-flow-assets/products/<uuid>.jpg`;
2. se ausente, aceitar fallback direto SOMENTE de origem confiável;
3. retornar fallback neutro existente caso nenhuma imagem segura/compatível esteja disponível.

Origens diretas permitidas:
- storage público do próprio projeto, apenas buckets `product-images` e `whatsapp-flow-assets`;
- `raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/...`.

Proteções mantidas/adicionadas:
- HTTPS obrigatório;
- redirects recusados (`redirect: error`);
- timeout de 3 segundos;
- somente `image/jpeg`, `image/png` e `image/webp`;
- máximo 80 KB para foto de detalhe;
- nenhum fetch de URL arbitrária;
- listas de produtos continuam limitadas a no máximo 20 e sem hidratação visual pesada em massa;
- cestas continuam usando seus 9 assets locais.

## Deploy
`whatsapp-flow-data-exchange-v1` foi redeployado com sucesso e está ACTIVE na revisão de deployment 53.
O marcador interno histórico `edge_version=49` do control plane não representa o contador de deployment da plataforma; o handler comercial continua V26.

## Verificação
- fonte ativa da Edge Function contém a allowlist e os limites V58;
- contrato estático adicionado em `scripts/test-whatsapp-flow-v58-trusted-image-fallback-contract.mjs`;
- control plane V57 permaneceu `ok=true` após o deploy;
- `physical_next_required=UPSELL`;
- `eligible_owner_conversations=0`;
- `active_owner_homologation_sessions=0`;
- `safe_to_launch_owner_v10=false`.

## Gates preservados após o deploy
- `whatsapp_live_canary_percent=1`;
- `experience_orchestrator_enabled=false`;
- `whatsapp_flow_data_exchange_enabled=false`;
- `whatsapp_flow_send_enabled=false`;
- `whatsapp_flow_commercial_write_enabled=false`;
- `bling_order_sync_enabled=false`.

## Make
Somente `consultar no cpf` permanece ativo e `incompleteExecutions=0`. Nenhum cenário Make foi modificado.

## Próximo passo
A prova física owner-only continua pendente a partir de `UPSELL`. Quando existir exatamente uma conversa autorizada dentro da janela de serviço, o único lançador permitido continua sendo o V10. Até lá, seguir melhorando componentes seguros e isolados sem abrir rollout.
