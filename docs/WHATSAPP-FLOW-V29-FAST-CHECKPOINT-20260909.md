# WhatsApp Flow V29 FAST — checkpoint 2026-09-09

## Objetivo
Candidata isolada para homologação do Flow comercial de cestas, preservando a V3 de produção e sem exposição a clientes.

## Segurança restaurada
- `whatsapp_live_canary_percent=1`
- `experience_orchestrator_enabled=false`
- `whatsapp_flow_data_exchange_enabled=false`
- `whatsapp_flow_send_enabled=false`
- `whatsapp_flow_commercial_write_enabled=false`
- `bling_order_sync_enabled=false`

A restauração foi aplicada no Supabase e persistida em migration nesta branch.

## Correções desta rodada
1. A otimização FAST passou a receber explicitamente o `definition_slug`, evitando alterar o comportamento de V1–V4.
2. A tela `CESTAS` da V5 preserva o campo `image` exigido pelo schema publicado, mas usa um placeholder Base64 mínimo durante o primeiro paint para não bloquear a abertura com 9 downloads.
3. A lista `PRODUTOS_[A-L]` usa `NavigationList.start.src`, em conformidade com o JSON v7.3 da V28; o runtime anterior escrevia `start.image`, incompatível com o contrato validado no build.
4. Até 20 produtos por página continuam permitidos, com orçamento total de mídia e concorrência limitada; nunca é carregado o catálogo completo.
5. Foto maior continua restrita à tela `PRODUTO_[A-L]`.
6. V5 permanece `candidate_not_live=true`, `default_for_new_sessions=false`, `customer_exposure=false`, handler `v16`, catálogo limitado a subconjuntos de até 20 itens.

## Fluxo funcional preservado
- cesta básica -> personalização sem preço individual dos componentes;
- menu de seções/busca -> subconjunto real do Supabase;
- tocar produto -> detalhe -> quantidade -> adicionar;
- revisão -> cadastro/endereço -> pagamento -> finalização;
- retorno NFM para a conversa;
- Bling não é acionado nesta homologação.

## Próximo bloco
- implantar a Edge Function a partir desta branch usando os arquivos robustos atuais de `crypto.ts` e `image.ts`;
- validar INIT/Data Exchange sem habilitar os gates comerciais;
- executar smokes determinísticos do V16 (menu, busca, lista, detalhe, validação de estoque, revisão);
- somente depois preparar novo teste real no número de homologação autorizado.
